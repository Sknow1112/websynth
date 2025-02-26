// components/SampleGenerator.tsx
import React, { useState } from "react";

interface SampleGeneratorProps {
    onSampleGenerated: (buffer: AudioBuffer) => void;
    audioContext: AudioContext | null;
    generationParams: {
        seed: number;
        numSteps: number;
        cfgStrength: number;
        duration: number;
    };
    onGeneratorOpenChange: (isOpen: boolean) => void;
    onPromptFocusChange: (focused: boolean) => void;
}

export const SampleGenerator: React.FC<SampleGeneratorProps> = ({
    onSampleGenerated,
    audioContext,
    generationParams,
    onGeneratorOpenChange,
    onPromptFocusChange
}) => {
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [prompt, setPrompt] = useState("");

    const toggleGenerator = () => {
        const newState = !isGeneratorOpen;
        setIsGeneratorOpen(newState);
        onGeneratorOpenChange(newState);
        setError("");
        setStatusMessage("");
    };

    const generateSample = async () => {
        if (!prompt.trim() || !audioContext) {
            setError("Please enter a prompt");
            return;
        }

        try {
            setIsGenerating(true);
            setError("");
            setStatusMessage("Connecting to AI service...");

            const response = await fetch("https://www.sergidev.me/api/synth/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt,
                    ...generationParams
                })
            });

            if (!response.ok) {
                let errorMessage = `Failed to generate sample (${response.status})`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Error: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            setStatusMessage("Processing generated audio...");
            const arrayBuffer = await response.arrayBuffer();

            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error("Received empty audio data");
            }

            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            onSampleGenerated(audioBuffer);
            setStatusMessage("Sample generated successfully!");

            setTimeout(() => {
                setIsGeneratorOpen(false);
                onGeneratorOpenChange(false);
                setStatusMessage("");
            }, 2000);
        } catch (err) {
            console.error("Error generating sample:", err);
            let userMessage = "Failed to generate sample. Using fallback generation.";
            setError(userMessage);
            await generateFallbackSample();
        } finally {
            setIsGenerating(false);
        }
    };

    const generateFallbackSample = async () => {
        try {
            setStatusMessage("Generating local sample...");
            const response = await fetch("/api/generate-sample", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ prompt }),
            });

            if (!response.ok) {
                throw new Error("Fallback generation failed");
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
            onSampleGenerated(audioBuffer);
            setStatusMessage("Local sample generated successfully!");
            
            setTimeout(() => {
                setIsGeneratorOpen(false);
                onGeneratorOpenChange(false);
                setStatusMessage("");
            }, 2000);
        } catch (err) {
            setError("Failed to generate sample. Please try again.");
        }
    };

    return (
        <div className="generator-container">
            <button onClick={toggleGenerator} className="generate-button">
                {isGeneratorOpen ? "Close Generator" : "Generate Sample"}
            </button>

            {isGeneratorOpen && (
                <div className="generator-panel">
                    <div className="prompt-container">
                        <label htmlFor="prompt" className="prompt-label">
                            Describe the sound you want to generate:
                        </label>
                        <textarea
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onFocus={() => {
                                audioContext?.suspend();
                                onPromptFocusChange(true);
                            }}
                            onBlur={() => {
                                audioContext?.resume();
                                onPromptFocusChange(false);
                            }}
                            placeholder="E.g., 'Deep bass drum', 'Bright snare hit', 'Synth pad with reverb'"
                            disabled={isGenerating}
                            className="prompt-input"
                        />
                    </div>

                    <button
                        onClick={generateSample}
                        disabled={isGenerating || !prompt.trim()}
                        className={`submit-button ${isGenerating ? "generating" : ""}`}
                    >
                        {isGenerating ? "Generating..." : "Generate"}
                    </button>

                    {statusMessage && <div className="status-message">{statusMessage}</div>}
                    {error && <div className="error-message">{error}</div>}
                </div>
            )}

            <style jsx>{`
                .generator-container {
                    margin: 1rem 0;
                }

                .generator-panel {
                    background: var(--background-secondary);
                    padding: 1.5rem;
                    border-radius: 8px;
                    margin-top: 1rem;
                }

                .parameters-container {
                    margin: 1rem 0;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .parameter-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .parameter-group label {
                    min-width: 150px;
                }

                .parameter-group input[type="range"] {
                    flex: 1;
                }

                .parameter-value {
                    min-width: 3rem;
                    text-align: right;
                }

                .prompt-input {
                    width: 100%;
                    min-height: 80px;
                    margin: 0.5rem 0;
                    padding: 0.5rem;
                }
            `}</style>
        </div>
    );
};
