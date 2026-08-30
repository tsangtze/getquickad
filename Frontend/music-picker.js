(() => {
  "use strict";

  function musicText(key, fallback, params = {}) {
    return window.QuickAdI18n?.t(key, params) || fallback;
  }
  const field = document.getElementById("music-options");
  const note = document.getElementById("music-note");
  const player = document.getElementById("music-preview");
  const slider = document.getElementById("music-volume");
  const volumeOutput = document.getElementById("music-volume-value");
  function setVolume(value) {
    const level = Number.isInteger(value) && value >= 0 && value <= 100 ? value : 10;
    slider.value = String(level);
    volumeOutput.textContent = level === 0 ? "0% (muted)" : `${level}%`;
    player.volume = level / 100;
  }
  setVolume(10);
  slider.addEventListener("input", () => { if (!state) setVolume(Number(slider.value)); });
  const inputs = [...field.querySelectorAll('input[name="musicChoice"]')];
  const allowed = new Set(inputs.map(input => input.value));
  let state = "";
  let playSequence = 0;
  function stop() {
    playSequence++;
    player.pause();
    player.removeAttribute("src");
    player.load();
    player.hidden = true;
  }
  function lock(next) {
    state = next;
    field.disabled = Boolean(next);
    stop();
    note.textContent = next === "ready"
      ? musicText("music.locked_note", "Music selection is saved with this video. Create a new project for different music.")
      : next === "busy" ? musicText("music.creating_selected", "Creating your video with the selected soundtrack…")
      : musicText("music.choose_before_final", "Choose a track before creating the final video.");
  }
  field.addEventListener("change", event => { if (event.target.name === "musicChoice") stop(); });
  field.addEventListener("click", async event => {
    const button = event.target.closest("[data-music-preview]");
    if (!button || state) return;
    const id = button.dataset.musicPreview;
    if (!allowed.has(id) || id === "none") return;
    stop();
    const sequence = playSequence;
    player.src = `/music/${id}.mp3`;
    player.hidden = false;
    player.volume = Number(slider.value) / 100;
    note.textContent = musicText("music.preview_playing", "10-second preview at your selected music volume. The final video also includes narration.");
    try { await player.play(); }
    catch {
      if (sequence === playSequence) note.textContent = musicText("music.preview_failed", "Preview could not play. Check the music files and try again.");
    }
  });
  player.addEventListener("timeupdate", () => { if (player.currentTime >= 10) player.pause(); });
  player.addEventListener("error", () => { if (player.hasAttribute("src")) note.textContent = musicText("music.preview_unavailable", "Music preview unavailable. Check the installation."); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  window.quickAdMusic = Object.freeze({
    get value() { return inputs.find(input => input.checked)?.value || "none"; },
    get volume() { return Number(slider.value); },
    get locked() { return Boolean(state); },
    stop, lock,
    restore(value, complete = false, volume) {
      const chosen = allowed.has(value) ? value : "none";
      inputs.forEach(input => { input.checked = input.value === chosen; });
      setVolume(volume === undefined && complete && chosen !== "none" ? 25 : volume);
      lock(complete ? "ready" : "");
    }
  });
})();
