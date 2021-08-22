/* globals Sortable */
'use strict';

const entries = document.getElementById('entries');
const loop = document.getElementById('loop');
const pause = document.getElementById('pause');

// sortable
let sortable;
document.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.onload = () => {
    sortable = Sortable.create(entries, {
      direction: 'vertical',
      handle: '[data-id="drag"]',
      animation: 150
    });
  };
  script.onerror = e => console.log(e, script.src);
  script.src = 'libs/Sortable.js';
  document.body.appendChild(script);
});

// drag & drop
const append = files => {
  const t = document.getElementById('entry');
  for (const file of [...files]) {
    const {name, type} = file;
    const clone = document.importNode(t.content, true);
    const entry = clone.querySelector('.entry');
    clone.querySelector('[data-id="name"]').textContent = name;
    if (type.startsWith('audio') || type.startsWith('video')) {
      const audio = new Audio();
      audio.controls = true;
      audio.controlsList = 'nodownload';
      const src = URL.createObjectURL(file);
      audio.src = src;
      entry.dataset.id = append.index++;
      entry.file = file;
      const warning = clone.querySelector('[data-id="warning"]');
      warning.parentNode.replaceChild(audio, warning);
      document.getElementById('join').disabled = false;
    }
    else {
      entry.classList.add('disabled');
    }
    entries.appendChild(clone);
  }
};
append.index = 0;
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => {
  e.preventDefault();
  append(e.dataTransfer.files);
});
document.getElementById('entries-container').addEventListener('dblclick', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,video/*';
  input.multiple = true;
  input.onchange = e => {
    append(e.target.files);
  };
  input.click();
});

// remove
document.getElementById('entries').addEventListener('click', e => {
  const command = e.target.dataset.command;
  if (command === 'remove') {
    const entry = e.target.closest('.entry');
    if (entry) {
      entry.remove();
      const audio = document.querySelector('#entries audio');
      if (!audio) {
        document.getElementById('join').disabled = true;
      }
    }
  }
});

// single play
let player;
document.addEventListener('play', e => {
  if (e.target.controls) {
    if (player && e.target !== player) {
      player.pause();
    }
    player = e.target;
  }
  pause.disabled = false;
}, true);
document.addEventListener('ended', e => {
  const entry = e.target.closest('.entry');
  if (entry) {
    const oid = e.target.closest('.entry').dataset.id;
    if (loop.checked) {
      const ids = sortable.toArray();
      for (const id of ids) {
        if (id === oid) {
          const index = ids.indexOf(id);
          const next = ids[index + 1];
          if (next) {
            const audio = document.querySelector(`[data-id="${next}"] audio`);
            audio.play();
          }
          return;
        }
      }
    }
  }
  pause.disabled = true;
}, true);
pause.addEventListener('click', e => {
  if (player && e.target.dataset.command === 'pause') {
    player.pause();
    e.target.dataset.command = 'play';
    e.target.value = 'Play';
  }
  else if (player && e.target.dataset.command === 'play') {
    player.play();
    e.target.dataset.command = 'pause';
    e.target.value = 'Pause';
  }
});

// Convert AudioBuffer to a Blob using WAVE representation
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  const setUint16 = data => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = data => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (let i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) { // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  // create Blob
  return new Blob([buffer], {type: 'audio/wav'});
}


// join
{
  const read = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
  const decode = buffer => new Promise((resolve, reject) => {
    const context = new AudioContext();
    context.decodeAudioData(buffer, resolve, reject);
  });
  document.getElementById('join').addEventListener('click', async e => {
    e.target.disabled = true;

    const abs = [];
    let name = '';
    for (const id of sortable.toArray()) {
      const entry = document.querySelector(`[data-id="${id}"]`);
      if (!entry || entry.classList.contains('disabled')) {
        continue;
      }
      const msg = entry.querySelector('[data-id=msg]');
      msg.textContent = 'Reading File...';
      entry.scrollIntoView();
      const buffer = await read(entry.file);
      name = name || entry.file.name;
      msg.textContent = 'Decoding File...';
      abs.push(await decode(buffer));
      msg.textContent = '';
    }
    // mixing
    const delay = Number(document.getElementById('delay').value) / 1000;
    const maxChannels = Math.max(...abs.map(ab => ab.numberOfChannels));
    const total = abs.reduce((p, c) => {
      p += c.duration;
      return p;
    }, delay * (abs.length - 1));
    const context = new AudioContext();
    const buffer = context.createBuffer(
      maxChannels,
      Math.ceil(total * context.sampleRate),
      context.sampleRate
    );
    let duration = 0;
    for (const ab of abs) {
      for (let i = 0; i < ab.numberOfChannels; i += 1) {
        const channel = buffer.getChannelData(i);
        channel.set(ab.getChannelData(i), duration * context.sampleRate);
      }
      duration += ab.duration + delay;
    }

    const blob = bufferToWave(buffer, buffer.length);
    const src = URL.createObjectURL(blob);

    const t = document.getElementById('download');
    const clone = document.importNode(t.content, true);
    clone.querySelector('audio').src = src;
    clone.querySelector('audio').dataset.name = name;

    document.getElementById('downloads').appendChild(clone);
    document.getElementById('downloads').classList.remove('hidden');

    e.target.disabled = false;
  });
}

document.getElementById('downloads').addEventListener('submit', e => {
  e.preventDefault();
  const audio = e.target.querySelector('audio');
  const name = audio.dataset.name;
  const a = document.createElement('a');
  a.download = name.replace(/\.[^.]+$/, '') + '.wav';
  a.href = audio.src;
  a.click();
});

document.getElementById('sample').addEventListener('click', () => chrome.tabs.create({
  url: 'https://webbrowsertools.com/audio-test/'
}));
