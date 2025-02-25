import React, { useState, useEffect, useRef, useCallback } from "react";
import { Recorder } from "../components/Recorder";
import { SoundfontExporter } from "../components/SoundfontExporter";
import { AudioVisualizer } from "../components/AudioVisualizer";

const keyMap: { [key: string]: number } = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number;
}

const IndexPage: React.FC = () => {
  const MAX_VOICES = 8; // Limit simultaneous voices
  const getOldestVoice = (voices: { [key: string]: ActiveVoice }) => {
    let oldestKey = "";
    let oldestTime = Infinity;
    Object.entries(voices).forEach(([key, voice]) => {
      if (voice.startTime < oldestTime) {
        oldestTime = voice.startTime;
        oldestKey = key;
      }
    });
    return oldestKey;
  };
  const [attack, setAttack] = useState<number>(0.1);
  const [release, setRelease] = useState<number>(0.3);
  const [reverbAmount, setReverbAmount] = useState<number>(0.2);
  const [octave, setOctave] = useState<number>(0);
  const [sampleBuffer, setSampleBuffer] = useState<AudioBuffer | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const feedbackGainRef = useRef<GainNode | null>(null);
  const reverbMixGainRef = useRef<GainNode | null>(null);
  const activeVoicesRef = useRef<{ [key: string]: ActiveVoice }>({});

  useEffect(() => {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    // Load default sound
    fetch("/sounds/default.flac")
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioCtx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => setSampleBuffer(audioBuffer))
      .catch((error) => console.error("Error loading default sound:", error));
    audioContextRef.current = audioCtx;

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);
    masterGainRef.current = masterGain;

    const delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.3;
    delayNodeRef.current = delayNode;

    const feedbackGain = audioCtx.createGain();
    feedbackGain.gain.value = reverbAmount;
    feedbackGainRef.current = feedbackGain;

    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    const reverbMixGain = audioCtx.createGain();
    reverbMixGain.gain.value = reverbAmount;
    reverbMixGainRef.current = reverbMixGain;

    delayNode.connect(reverbMixGain);
    reverbMixGain.connect(masterGain);

    return () => {
      audioCtx.close();
    };
  }, []);

  useEffect(() => {
    if (feedbackGainRef.current && reverbMixGainRef.current) {
      feedbackGainRef.current.gain.value = reverbAmount;
      reverbMixGainRef.current.gain.value = reverbAmount;
    }
  }, [reverbAmount]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (!event.target?.result || !audioContextRef.current) return;

      try {
        const buffer = await audioContextRef.current.decodeAudioData(
          event.target.result as ArrayBuffer,
        );
        setSampleBuffer(buffer);
      } catch (error) {
        console.error("Error decoding audio file:", error);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!audioContextRef.current || !sampleBuffer) return;
      const key = e.key.toLowerCase();
      if (!(key in keyMap) || activeVoicesRef.current[key]) return;

      setActiveKeys((prev) => new Set([...prev, key]));

      if (audioContextRef.current.state !== "running") {
        audioContextRef.current.resume();
      }

      const currentTime = audioContextRef.current.currentTime;
      const semitoneShift = keyMap[key] + octave * 12;
      const playbackRate = Math.pow(2, semitoneShift / 12);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = sampleBuffer;
      source.playbackRate.value = playbackRate;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.setValueAtTime(0, currentTime);
      gainNode.gain.linearRampToValueAtTime(1, currentTime + attack);

      source.connect(gainNode);
      if (masterGainRef.current && delayNodeRef.current) {
        gainNode.connect(masterGainRef.current);
        gainNode.connect(delayNodeRef.current);
      }

      // Implement voice stealing if we exceed max voices
      if (Object.keys(activeVoicesRef.current).length >= MAX_VOICES) {
        const oldestKey = getOldestVoice(activeVoicesRef.current);
        const oldVoice = activeVoicesRef.current[oldestKey];
        oldVoice.gainNode.gain.cancelScheduledValues(currentTime);
        oldVoice.gainNode.gain.setValueAtTime(
          oldVoice.gainNode.gain.value,
          currentTime,
        );
        oldVoice.gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.01);
        oldVoice.source.stop(currentTime + 0.01);
        delete activeVoicesRef.current[oldestKey];
        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(oldestKey);
          return next;
        });
      }

      source.start();
      activeVoicesRef.current[key] = {
        source,
        gainNode,
        startTime: audioContextRef.current.currentTime,
      };
    },
    [attack, octave, sampleBuffer],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!audioContextRef.current) return;
      const key = e.key.toLowerCase();
      const voice = activeVoicesRef.current[key];
      if (!voice) return;

      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      const currentTime = audioContextRef.current.currentTime;
      voice.gainNode.gain.cancelScheduledValues(currentTime);
      voice.gainNode.gain.setValueAtTime(
        voice.gainNode.gain.value,
        currentTime,
      );
      voice.gainNode.gain.linearRampToValueAtTime(0, currentTime + release);
      voice.source.stop(currentTime + release);
      setTimeout(() => {
        delete activeVoicesRef.current[key];
      }, release * 1000);
    },
    [release],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-12">
      <div className="synth-container transform-gpu perspective-2000 rotate-x-2 shadow-2xl">
        <div className="synth-body">
          <div className="synth-panel">
            <h1 className="synth-title">WEB:SYNTH</h1>

            <div className="controls-grid">
              <div className="input-section space-y-4">
                <div className="upload-container">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="file-input"
                    id="audio-upload"
                  />
                  <label htmlFor="audio-upload" className="upload-button">
                    Upload Sample
                  </label>
                </div>
                <Recorder onRecordingComplete={setSampleBuffer} />
                <SoundfontExporter sampleBuffer={sampleBuffer} />
              </div>

              <div className="parameters-section">
                <div className="parameter-grid">
                  {[
                    {
                      id: "attack",
                      label: "Attack",
                      value: attack,
                      setValue: setAttack,
                      min: 0.01,
                      max: 2,
                    },
                    {
                      id: "release",
                      label: "Release",
                      value: release,
                      setValue: setRelease,
                      min: 0.1,
                      max: 3,
                    },
                    {
                      id: "reverb",
                      label: "Reverb",
                      value: reverbAmount,
                      setValue: setReverbAmount,
                      min: 0,
                      max: 1,
                    },
                    {
                      id: "octave",
                      label: "Octave",
                      value: octave,
                      setValue: setOctave,
                      min: -2,
                      max: 2,
                      step: 1,
                    },
                  ].map((param) => (
                    <div key={param.id} className="parameter-control">
                      <label htmlFor={param.id}>
                        {param.label}
                        <span className="value-display">
                          {typeof param.value === "number"
                            ? param.value.toFixed(2)
                            : param.value}
                        </span>
                      </label>
                      <input
                        type="range"
                        id={param.id}
                        min={param.min}
                        max={param.max}
                        step={param.step || 0.01}
                        value={param.value}
                        onChange={(e) =>
                          param.setValue(parseFloat(e.target.value))
                        }
                        className="parameter-slider"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="keyboard-section">
                <div className="keys-grid">
                  {Object.entries(keyMap).map(([key]) => (
                    <div
                      key={key}
                      className={`key ${activeKeys.has(key) ? "key-active" : ""}`}
                    >
                      {key.toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="visualizer-section">
              <AudioVisualizer
                audioContext={audioContextRef.current}
                masterGainNode={masterGainRef.current}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndexPage;
