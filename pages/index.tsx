import React, { useState, useEffect, useRef, useCallback } from "react";
import { Recorder } from "../components/Recorder";
import { AudioVisualizer } from "../components/AudioVisualizer";
import { SampleGenerator } from "../components/SampleGenerator";

interface Parameter {
    id: string;
    label: string;
    value: number;
    setValue: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    valueDisplay?: string;
}

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
    const [notification, setNotification] = useState<string>("");
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const delayNodeRef = useRef<DelayNode | null>(null);
    const feedbackGainRef = useRef<GainNode | null>(null);
    const reverbMixGainRef = useRef<GainNode | null>(null);
    const activeVoicesRef = useRef<{ [key: string]: ActiveVoice }>({});
    const isPromptFocusedRef = useRef(false);

    // AI Generation parameters
    const [generationParams, setGenerationParams] = useState({
        seed: -1,
        numSteps: 25,
        cfgStrength: 4.5,
        duration: 1
    });

    const handleGenerationParamChange = (param: string, value: number) => {
        setGenerationParams(prev => ({
            ...prev,
            [param]: value
        }));
    };

    const handlePromptFocusChange = (focused: boolean) => {
        isPromptFocusedRef.current = focused;
    };

    useEffect(() => {
        const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        // Load default sound
        fetch("/websynth/sounds/default.wav")
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to load default sound");
                }
                return response.arrayBuffer();
            })
            .then((arrayBuffer) => audioCtx.decodeAudioData(arrayBuffer))
            .then((audioBuffer) => setSampleBuffer(audioBuffer))
            .catch((error) => {
                console.error("Error loading default sound:", error);
                // Fallback to generating a simple sine wave buffer
                const sampleRate = audioCtx.sampleRate;
                const buffer = audioCtx.createBuffer(
                    1,
                    sampleRate * 0.5,
                    sampleRate,
                );
                const channelData = buffer.getChannelData(0);
                for (let i = 0; i < buffer.length; i++) {
                    channelData[i] = Math.sin(
                        (2 * Math.PI * 440 * i) / sampleRate,
                    );
                }
                setSampleBuffer(buffer);
            });
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
                showNotification("Sample loaded successfully");
            } catch (error) {
                console.error("Error decoding audio file:", error);
                showNotification("Error loading audio file");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    const playNote = useCallback((key: string) => {
        if (!audioContextRef.current || !sampleBuffer || !masterGainRef.current) return;

        const source = audioContextRef.current.createBufferSource();
        const gainNode = audioContextRef.current.createGain();
        
        source.buffer = sampleBuffer;
        source.connect(gainNode);
        gainNode.connect(masterGainRef.current);
        
        // Apply envelope
        gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioContextRef.current.currentTime + attack);
        
        source.start();
        source.onended = () => {
            gainNode.disconnect();
        };

        // Store the voice without checking for existing ones
        activeVoicesRef.current[`${key}_${Date.now()}`] = {
            source,
            gainNode,
            startTime: audioContextRef.current.currentTime
        };
    }, [attack, sampleBuffer]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (isPromptFocusedRef.current) return;
        if (!audioContextRef.current || !sampleBuffer) return;
        const key = e.key.toLowerCase();
        if (!(key in keyMap) || activeVoicesRef.current[key]) return;

        setActiveKeys((prev) => {
            const newSet = new Set(prev);
            newSet.add(key);
            return newSet;
        });

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
            oldVoice.gainNode.gain.linearRampToValueAtTime(
                0,
                currentTime + 0.01,
            );
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
    }, [attack, octave, sampleBuffer]);

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
            voice.gainNode.gain.linearRampToValueAtTime(
                0,
                currentTime + release,
            );
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

    // Handler for when a sample is generated
    const handleSampleGenerated = (buffer: AudioBuffer) => {
        setSampleBuffer(buffer);
        showNotification("AI-generated sample loaded successfully");
    };

    // Create two separate parameter arrays
    const standardParams: Parameter[] = [
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
    ];

    const aiParams: Parameter[] = [
        {
            id: "seed",
            label: "AI Seed",
            value: generationParams.seed,
            setValue: (v: number) => handleGenerationParamChange("seed", v),
            min: -1,
            max: 1000,
            step: 1,
            valueDisplay: generationParams.seed === -1 ? "random" : generationParams.seed.toString()
        },
        {
            id: "numSteps",
            label: "AI Quality",
            value: generationParams.numSteps,
            setValue: (v: number) => handleGenerationParamChange("numSteps", v),
            min: 10,
            max: 50,
            step: 5,
        },
        {
            id: "cfgStrength",
            label: "AI Guidance",
            value: generationParams.cfgStrength,
            setValue: (v: number) => handleGenerationParamChange("cfgStrength", v),
            min: 1,
            max: 7,
            step: 0.5,
        },
        {
            id: "duration",
            label: "AI Duration",
            value: generationParams.duration,
            setValue: (v: number) => handleGenerationParamChange("duration", v),
            min: 1,
            max: 8,
            step: 0.5,
            valueDisplay: `${generationParams.duration.toFixed(1)}s`
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center p-12">
            <div className="synth-container transform-gpu perspective-2000 rotate-x-2 shadow-2xl">
                <div className="synth-body">
                    <div className="synth-panel">
                        <h1 className="synth-title">WEB:SYNTH</h1>

                        {notification && (
                            <div className="notification-bar">
                                {notification}
                            </div>
                        )}

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
                                    <label
                                        htmlFor="audio-upload"
                                        className="upload-button"
                                    >
                                        Upload Sample
                                    </label>
                                </div>
                                <Recorder
                                    onRecordingComplete={(buffer) => {
                                        setSampleBuffer(buffer);
                                        showNotification(
                                            "Recording loaded successfully",
                                        );
                                    }}
                                />
                                <SampleGenerator
                                    onSampleGenerated={handleSampleGenerated}
                                    audioContext={audioContextRef.current}
                                    generationParams={generationParams}
                                    onGeneratorOpenChange={setIsGeneratorOpen}
                                    onPromptFocusChange={handlePromptFocusChange}
                                />
                            </div>

                            <div className="parameters-section">
                                <div className="parameter-grid">
                                    {[...standardParams, ...(isGeneratorOpen ? aiParams : [])].map((param) => (
                                        <div key={param.id} className="parameter-control">
                                            <label htmlFor={param.id}>
                                                {param.label}
                                                <span className="value-display">
                                                    {param.valueDisplay || 
                                                        (typeof param.value === "number" 
                                                            ? param.value.toFixed(2) 
                                                            : param.value)
                                                    }
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
