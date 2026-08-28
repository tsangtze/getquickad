import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const id='11111111-1111-4111-8111-111111111111';
const source=(await fs.readFile(new URL('../projectRoutes.mjs',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*\n/gm,'').replace(/export async function /g,'async function ');
function response(){return {code:200,status(n){this.code=n;return this;},json(d){this.data=d;return this;},set(){},vary(){}};}
async function fixture(run, overrides={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'quickad-delete-test-'));
 const directory=path.join(root,'projects',id);await fs.mkdir(directory,{recursive:true});
 const seed=async(status='video_ready',ownerId='owner')=>fs.writeFile(path.join(directory,'project.json'),JSON.stringify({id,ownerId,status,assets:{productImages:[{}]},storyboard:{}}));
 await seed();await fs.writeFile(path.join(directory,'storyboard.json'),JSON.stringify({storyboard:{}}));
 await fs.mkdir(path.join(directory,'assets'));await fs.writeFile(path.join(directory,'assets','photo.jpg'),'test');
 const routes={},middleware=[];let param;
 const router={use(fn){middleware.push(fn);},param(_n,fn){param=fn;},get(){},post(p,...h){routes['POST '+p]=h.at(-1);},delete(p,...h){routes['DELETE '+p]=h.at(-1);}};
 const multer=()=>({fields(){return ()=>{};}});multer.diskStorage=()=>({});
 const create=vm.runInNewContext(source+'\n;createProjectRouter',{fs,path,console,URL,crypto:{},express:{Router:()=>router},multer,cookieParser:()=> (_q,_s,next)=>next(),requireUser(q,s,next){if(!q.authUser)return s.status(401).json({ok:false});next();},authConfiguration:()=>({applicationOrigin:'http://localhost:4100'}),prepareMusic:()=>({metadata:{id:'none'}}),validateMusicVolume:()=>10,validateStoryboard:s=>({ok:true,storyboard:s}),generateNarration:async()=>({}),renderVideo:async()=>({}),...overrides});
 await create({projectRoot:root});
 async function invoke(method='DELETE',user='owner',origin='http://localhost:4100',projectId=id){const q={params:{projectId},authUser:user?{id:user}:undefined,method,get:()=>origin,body:{musicChoice:'none',storyboard:{scenes:[{caption:'Test',imageIndex:1}],totalDurationSeconds:25}}};const s=response();
 for(const m of middleware){let next=false;await m(q,s,()=>{next=true;});if(!next)return s;}
 let next=false;await param(q,s,()=>{next=true;},projectId);if(!next)return s;
 await routes[method+' /:projectId'+(method==='POST'?'/finalize':'')](q,s);return s;}
 try{await run({root,directory,seed,invoke});}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('owner deletion removes all project files and leaves other directories intact',()=>fixture(async({root,directory,invoke})=>{await fs.writeFile(path.join(root,'keep.txt'),'keep');assert.equal((await invoke()).code,200);await assert.rejects(fs.stat(directory),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'keep');assert.equal((await invoke()).code,404);}));
test('signed-out, foreign-owner, wrong-origin and invalid-ID requests cannot delete',()=>fixture(async({directory,invoke})=>{for(const [args,code] of [[['DELETE',null],401],[['DELETE','other'],404],[['DELETE','owner','https://evil.example'],403],[['DELETE','owner','http://localhost:4100','../secret'],400]])assert.equal((await invoke(...args)).code,code);assert.ok(await fs.stat(directory));}));
test('generating and unknown statuses fail closed; corrupt metadata is preserved',()=>fixture(async({directory,seed,invoke})=>{for(const status of ['uploaded','generating_storyboard','generating_narration','rendering_video','unknown']){await seed(status);assert.equal((await invoke()).code,409);}await fs.writeFile(path.join(directory,'project.json'),'bad json');assert.equal((await invoke()).code,503);assert.ok(await fs.stat(directory));}));
test('rendering lock blocks deletion and duplicate paid work until completion',async()=>{let release,started;const began=new Promise(r=>started=r);const gate=new Promise(r=>release=r);let calls=0;await fixture(async({seed,invoke,directory})=>{await seed('storyboard_ready');const pending=invoke('POST');await began;assert.equal((await invoke()).code,409);assert.equal((await invoke('POST')).code,409);assert.ok(await fs.stat(directory));release();assert.equal((await pending).code,201);assert.equal(calls,1);assert.equal((await invoke()).code,200);},{generateNarration:async()=>{calls++;started();await gate;return {};}});});
test('symlink project directory cannot delete external data', {skip: process.platform === 'win32' ? 'Windows symlink permissions vary; covered on Linux' : false},()=>fixture(async({root,directory,invoke})=>{const outside=path.join(root,'outside');await fs.rename(directory,outside);await fs.symlink(outside,directory,'junction');assert.equal((await invoke()).code,404);assert.ok(await fs.stat(path.join(outside,'project.json')));}));
const frontend=await fs.readFile(new URL('../../Frontend/app.js',import.meta.url),'utf8');
const deletion=frontend.slice(frontend.indexOf('async function deleteSavedProject('),frontend.indexOf('function renderRecentProjects()'));
test('cancel never requests deletion; success refreshes; failure displays error',async()=>{let confirmed=false,calls=0,refreshes=0,ok=true;const status={textContent:'',classList:{add(){}}};const context={window:{confirm:()=>confirmed,location:{reload(){}}},currentProjectId:'',encodeURIComponent,recentProjectStatus:status,quickAdProjectFetch:async(url,options)=>{calls++;assert.equal(options.method,'DELETE');return {ok,json:async()=>({ok,error:'Busy'})};},loadAccountProjects:async()=>refreshes++};const remove=vm.runInNewContext(deletion+';deleteSavedProject',context);const button={};await remove({id,title:'Test'},button);assert.equal(calls,0);confirmed=true;await remove({id,title:'Test'},button);assert.equal(refreshes,1);ok=false;await remove({id,title:'Test'},button);assert.equal(status.textContent,'Busy');assert.equal(button.disabled,false);});
