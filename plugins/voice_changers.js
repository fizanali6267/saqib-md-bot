const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const config = require('../config');

const voiceFilters = {
  robot: '-af "afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75"',
  chipmunk: '-af "asetrate=44100*1.5,atempo=0.9"',
  deep: '-af "asetrate=44100*0.7,atempo=1.2"',
  echo: '-af "aecho=0.8:0.9:1000|1800:0.05|0.06"',
  fast: '-af "atempo=1.5"',
  slow: '-af "atempo=0.75"',
  squirrel: '-af "asetrate=44100*1.7,atempo=0.8"',
  smooth: '-af "lowpass=f=3000,highpass=f=200"',
  blown: '-af "acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1"',
  flanger: '-af "flanger=delay=10:depth=5:regen=70:width=71:speed=0.5:shape=sine"',
  distortion: '-af "aecho=0.8:0.88:6:0.4,acrusher=level_in=3:level_out=10:bits=6"',
  radio: '-af "highpass=f=300,lowpass=f=3000,volume=1.5"',
  underwater: '-af "lowpass=f=800,aecho=0.8:0.88:60:0.4"',
  vibrate: '-af "vibrato=f=7:d=0.5"',
  chorus: '-af "chorus=0.7:0.9:55:0.4:0.25:2"',
  treble: '-af "treble=g=12"',
  earrape: '-af "volume=10,acrusher=level_in=8:level_out=18:bits=4"',
  ghostly: '-af "aecho=0.8:0.9:500|1000:0.2|0.1,asetrate=44100*0.8"',
  telephone: '-af "bandpass=f=1000:width_type=h:w=2000"',
  helium: '-af "asetrate=44100*1.4,atempo=0.95"'
};

module.exports = {
  name: 'voice_changers',
  commands: Object.keys(voiceFilters),
  execute: async (sock, m, { command, args, prefix }) => {
    const targetMsg = m.quoted ? m.quoted : m;
    const isAudio = targetMsg.type?.includes('audio');

    if (!targetMsg || !isAudio) {
      return m.reply(`❓ Quote an audio message or voice note to apply the *${prefix}${command}* effect!`);
    }

    await m.react('🎙️');
    try {
      const mediaBuffer = await targetMsg.download();
      const tmpId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const tmpIn = path.join(os.tmpdir(), `v_in_${tmpId}.mp3`);
      const tmpOut = path.join(os.tmpdir(), `v_out_${tmpId}.mp3`);

      fs.writeFileSync(tmpIn, mediaBuffer);
      const filter = voiceFilters[command] || '-af "volume=1.2"';

      exec(`ffmpeg -y -i "${tmpIn}" ${filter} -b:a 128k "${tmpOut}"`, async (err) => {
        try {
          if (err || !fs.existsSync(tmpOut)) throw new Error('FFmpeg voice modulation failed');
          const resBuffer = fs.readFileSync(tmpOut);

          await sock.sendMessage(m.chat, {
            audio: resBuffer,
            mimetype: 'audio/mp4',
            ptt: true
          }, { quoted: m });

          await m.react('✅');
        } catch (procErr) {
          await m.reply('❌ Voice filter failed: ' + procErr.message);
        } finally {
          try { fs.unlinkSync(tmpIn); } catch (_) {}
          try { fs.unlinkSync(tmpOut); } catch (_) {}
        }
      });
    } catch (e) {
      await m.reply('❌ Error downloading audio: ' + e.message);
    }
  }
};
