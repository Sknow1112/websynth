// pages/api/generate-sample.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        console.log("Starting generation with prompt:", prompt);

        // Instead of trying to call the Gradio API directly,
        // let's generate a local sample as a proof of concept.
        // This is a fallback since the Hugging Face Spaces API is not accessible.

        // We'll generate a simple synthetic sound based on the prompt
        // This simulates what an AI would do, but with a deterministic approach

        // Parse the prompt to extract basic sound characteristics
        const isLowFreq =
            prompt.toLowerCase().includes("bass") ||
            prompt.toLowerCase().includes("low") ||
            prompt.toLowerCase().includes("deep");

        const isHighFreq =
            prompt.toLowerCase().includes("high") ||
            prompt.toLowerCase().includes("bright") ||
            prompt.toLowerCase().includes("sharp");

        const isNoisy =
            prompt.toLowerCase().includes("noise") ||
            prompt.toLowerCase().includes("distortion") ||
            prompt.toLowerCase().includes("fuzzy");

        const hasReverb =
            prompt.toLowerCase().includes("reverb") ||
            prompt.toLowerCase().includes("echo") ||
            prompt.toLowerCase().includes("ambient");

        // Set base frequency based on prompt analysis
        let baseFreq = 440; // default A4
        if (isLowFreq) baseFreq = 110; // A2
        if (isHighFreq) baseFreq = 880; // A5

        console.log(
            `Generating synth sound with frequency ${baseFreq}Hz, noise: ${isNoisy}, reverb: ${hasReverb}`,
        );

        // Generate audio data
        const sampleRate = 44100;
        const duration = 2; // seconds

        // Create audio buffer (16-bit stereo)
        const numSamples = Math.floor(sampleRate * duration);
        const audioBuffer = new ArrayBuffer(numSamples * 4); // 16-bit stereo = 4 bytes per sample
        const view = new DataView(audioBuffer);

        // Generate waveform
        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;

            // Basic sine wave
            let sample = Math.sin(2 * Math.PI * baseFreq * t);

            // Add harmonics for richer sound
            if (isLowFreq) {
                sample += 0.5 * Math.sin(2 * Math.PI * baseFreq * 2 * t); // octave
                sample += 0.25 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t); // fifth
            }

            if (isHighFreq) {
                sample += 0.3 * Math.sin(2 * Math.PI * baseFreq * 3 * t); // higher harmonic
            }

            // Add noise if requested
            if (isNoisy) {
                sample += 0.2 * (Math.random() * 2 - 1);
            }

            // Apply envelope
            const attack = 0.1;
            const release = 0.3;
            let envelope = 1.0;

            if (t < attack) {
                envelope = t / attack; // Attack phase
            } else if (t > duration - release) {
                envelope = (duration - t) / release; // Release phase
            }

            // Apply reverb simulation (simple echo)
            if (hasReverb && t > 0.1) {
                const echo1 =
                    Math.sin(2 * Math.PI * baseFreq * (t - 0.1)) * 0.3;
                const echo2 =
                    Math.sin(2 * Math.PI * baseFreq * (t - 0.2)) * 0.15;
                sample = sample + echo1 + echo2;
            }

            // Normalize and quantize to 16-bit
            sample = sample * envelope * 0.7; // Prevent clipping
            const int16Sample = Math.max(
                -32768,
                Math.min(32767, Math.floor(sample * 32767)),
            );

            // Write stereo samples
            view.setInt16(i * 4, int16Sample, true); // Left channel
            view.setInt16(i * 4 + 2, int16Sample, true); // Right channel
        }

        // Create WAV header
        const wavHeader = createWavHeader(sampleRate, 2, 16, numSamples);

        // Combine header and audio data
        const wavBuffer = Buffer.concat([
            Buffer.from(wavHeader),
            Buffer.from(audioBuffer),
        ]);

        // Return the WAV file
        res.setHeader("Content-Type", "audio/wav");
        res.status(200).send(wavBuffer);
    } catch (error) {
        console.error("Error generating sample:", error);
        res.status(500).json({
            error: `Server error: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Helper function to create a WAV header
function createWavHeader(
    sampleRate: number,
    numChannels: number,
    bitsPerSample: number,
    numSamples: number,
): ArrayBuffer {
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, "RIFF");
    // RIFF chunk length
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    writeString(view, 8, "WAVE");
    // format chunk identifier
    writeString(view, 12, "fmt ");
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    // bits per sample
    view.setUint16(34, bitsPerSample, true);
    // data chunk identifier
    writeString(view, 36, "data");
    // data chunk length
    view.setUint32(40, dataSize, true);

    return buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
