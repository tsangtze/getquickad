import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { MUSIC_TRACKS, prepareMusic, audioMixFilters, validateMusicVolume } from "../musicCatalog.mjs";
let ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) {
  try { ffmpeg = (await import("ffmpeg-static")).default; }
  catch { ffmpeg = "ffmpeg"; }
}
function run(args) {
  const result = spawnSync(ffmpeg, ["-v", "error", ...args], {maxBuffer: 30*1024*1024, timeout: 60000});
  assert.equal(result.status, 0, result.error?.message || result.stderr?.toString());
  return result.stdout;
}
test("unknown music cannot become a file path; legacy defaults to none", async () => {
  assert.equal((await prepareMusic()).path, null);
  for (const invalid of ["../narration", "https://example.com/music.mp3", "constructor", "__proto__", {}, 1, ""]) {
    await assert.rejects(prepareMusic(invalid), error => error.status === 400);
  }
  for (const invalid of [NaN, Infinity, 0, -1, "25", 301]) assert.throws(() => audioMixFilters(0,1,invalid));
});
test("every bundled track decodes; mix is stereo, non-silent and has exact duration", async () => {
  for (const id of Object.keys(MUSIC_TRACKS).filter(id => id !== "none")) {
    const track = await prepareMusic(id);
    const buffer = run(["-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=1", "-stream_loop","-1","-i",track.path,
      "-filter_complex",audioMixFilters(0,1,2).join(";"),"-map","[audio]","-f","f32le","-acodec","pcm_f32le","pipe:1"]);
    assert.equal(buffer.length, 2*48000*2*4, id);
    let energy=0, peak=0;
    // Last half-second contains only music, fading out.
    for(let i=buffer.length/4*3/4|0; i<buffer.length/4; i++) {
      const x=buffer.readFloatLE(i*4); energy+=x*x; peak=Math.max(peak,Math.abs(x));
    }
    assert.ok(energy > .001, `${id}: music missing after voice ends`);
    assert.ok(peak < .951, `${id}: clipping`);
  }
});
test("No music preserves narration amplitude and pads to video length", () => {
  const args=["-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=1"];
  const original=run([...args,"-ar","48000","-f","f32le","pipe:1"]);
  const mixed=run([...args,"-filter_complex",audioMixFilters(0,null,2).join(";"),"-map","[audio]","-ar","48000","-f","f32le","pipe:1"]);
  assert.deepEqual(mixed.subarray(0,original.length),original);
  assert.equal(mixed.length,48000*2*4);
  assert.ok(mixed.subarray(original.length).every(byte => byte === 0));
});
test("music fades in and out across a complete 25-second video", () => {
  const graph=audioMixFilters(0,1,25).join(";");
  const data=run(["-f","lavfi","-i","anullsrc=r=48000:cl=stereo:d=25","-f","lavfi","-i","sine=frequency=1000:duration=25", "-filter_complex",graph,"-map","[audio]","-f","f32le","pipe:1"]);
  assert.equal(data.length,25*48000*2*4);
  function rms(from,to) {let sum=0,n=0;for(let i=from*48000*2|0;i<(to*48000*2|0);i++){sum+=data.readFloatLE(i*4)**2;n++;}return Math.sqrt(sum/n);}
  assert.ok(rms(0,.1)<rms(2,3)/3);
  assert.ok(rms(24.9,25)<rms(2,3)/3);
});
test("picker restores legacy choice, stops previews, and locks completed video choices", async () => {
  const listeners={};
  const inputs=Object.keys(MUSIC_TRACKS).map(value=>({value,checked:value==="none"}));
  const field={disabled:false,querySelectorAll:()=>inputs,addEventListener:(k,f)=>{listeners[k]=f;}};
  let pauses=0, loads=0;
  const player={hidden:true,pause(){pauses++;},load(){loads++;},removeAttribute(){},hasAttribute(){return false;},addEventListener(){},play:async()=>{}};
  const slider={value:"10",addEventListener:(k,f)=>{listeners["volume-"+k]=f;}};
  const output={textContent:""};
  const note={textContent:""};
  const document={getElementById:id=>({"music-volume":slider,"music-volume-value":output,"music-options":field,"music-note":note,"music-preview":player})[id],addEventListener(){}};
  const window={addEventListener(){}};
  vm.runInNewContext(await fs.readFile(new URL("../../Frontend/music-picker.js",import.meta.url),"utf8"),{document,window,Set});
  const api=window.quickAdMusic;
  api.restore(undefined);assert.equal(api.value,"none");
  assert.equal(api.volume,10);
  slider.value="35";listeners["volume-input"]();
  assert.equal(api.volume,35);assert.equal(player.volume,.35);
  api.restore("calm",false,15);assert.equal(api.volume,15);
  api.restore("calm");assert.equal(api.value,"calm");
  await listeners.click({target:{closest:()=>({dataset:{musicPreview:"calm"}})}});
  assert.equal(player.src,"/music/calm.mp3");assert.equal(player.hidden,false);assert.equal(player.volume,.1);
  api.lock("busy");assert.ok(field.disabled);assert.ok(api.locked);assert.ok(player.hidden);
  api.restore("upbeat",true);assert.equal(api.volume,25);assert.equal(api.value,"upbeat");assert.ok(api.locked);
  api.restore("none");assert.equal(api.locked,false);assert.ok(pauses>0&&loads>0);
});
test("finalize rejects invalid music before paid work and persists valid selection", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"quickad-music-test-"));
  try {
    const id="11111111-1111-4111-8111-111111111111";
    const folder=path.join(root,"projects",id);await fs.mkdir(folder,{recursive:true});
    const projectPath=path.join(folder,"project.json");
    const seed={id,status:"storyboard_ready",assets:{productImages:[{}]},storyboard:{}};
    await fs.writeFile(projectPath,JSON.stringify(seed));
    await fs.writeFile(path.join(folder,"storyboard.json"),JSON.stringify({storyboard:{}}));
    let narrationCalls=0, renderChoice, renderVolume;
    const routes={};const router={use(){},param(){},get(){},delete(){},post(route,...handlers){routes[route]=handlers.at(-1);}};
    const multer=()=>({fields(){return ()=>{};}});multer.diskStorage=()=>({});
    const source=(await fs.readFile(new URL("../projectRoutes.mjs",import.meta.url),"utf8"))
      .replace(/^import[\s\S]*?;\s*\n/gm,"").replace(/export async function /g,"async function ");
    const create=vm.runInNewContext(source+"\n;createProjectRouter",{
      fs,path,console,crypto:{},cookieParser:()=>()=>{},requireUser(){},authConfiguration(){return {};},
      express:{Router:()=>router},multer,prepareMusic,validateMusicVolume,
      validateStoryboard:storyboard=>({ok:true,storyboard}),generateStoryboard(){throw new Error("Unexpected");},
      generateNarration:async()=>{narrationCalls++;return {};},
      renderVideo:async({musicChoice,musicVolume})=>{renderChoice=musicChoice;renderVolume=musicVolume;return {music:{id:musicChoice}};}
    });
    await create({projectRoot:root});
    async function invoke(musicChoice,musicVolume) {
      const response={code:200,status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
      await routes["/:projectId/finalize"]({params:{projectId:id},body:{musicChoice,musicVolume,storyboard:{scenes:[{caption:"Hello",imageIndex:1}],totalDurationSeconds:25}}},response);
      return response;
    }
    assert.equal((await invoke("../../secret")).code,400);
    for(const volume of [-1,101,NaN,Infinity,"10",null,{},1.5]) {
      assert.equal((await invoke("calm",volume)).code,400);
    }
    assert.equal(narrationCalls,0);
    assert.deepEqual(JSON.parse(await fs.readFile(projectPath,"utf8")),seed);
    assert.equal((await invoke("calm",18)).code,201);
    assert.equal(narrationCalls,1);assert.equal(renderChoice,"calm");assert.equal(renderVolume,18);
    assert.equal(JSON.parse(await fs.readFile(projectPath,"utf8")).storyboard.musicVolume,18);
    assert.equal(JSON.parse(await fs.readFile(projectPath,"utf8")).storyboard.musicChoice,"calm");
    assert.equal((await invoke("upbeat")).code,409);
    assert.equal(narrationCalls,1,"completed videos must not incur repeat cost");
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test("music slider gain reaches the mix, with exact mute and quieter default", () => {
  assert.equal(validateMusicVolume(),10);
  const args=["-f","lavfi","-i","anullsrc=r=48000:cl=stereo:d=4","-f","lavfi","-i","sine=frequency=1000:sample_rate=48000:duration=4"];
  function energy(level) {
    const data=run([...args,"-filter_complex",audioMixFilters(0,1,4,level).join(";"),"-map","[audio]","-f","f32le","pipe:1"]);
    let sum=0;
    for(let i=48000*2;i<48000*2*2;i++) sum+=data.readFloatLE(i*4)**2;
    return Math.sqrt(sum/96000);
  }
  assert.equal(energy(0),0);
  const quiet=energy(10), loud=energy(25);
  assert.ok(Math.abs(quiet/loud-.4)<.001);
  assert.ok(energy(100)>loud);
});
