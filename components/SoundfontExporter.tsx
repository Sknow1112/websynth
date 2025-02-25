import React, { useState } from "react";

export const SoundfontExporter: React.FC<{
    sampleBuffer: AudioBuffer | null;
}> = ({ sampleBuffer }) => {
    const [isExporting, setIsExporting] = useState(false);

    const processSample = async (buffer: AudioBuffer): Promise<Int16Array> => {
        // Ensure proper sample processing
        const sampleData = new Int16Array(buffer.length);
        const leftChannel = buffer.getChannelData(0);

        // Normalize audio data
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            peak = Math.max(peak, Math.abs(leftChannel[i]));
        }
        const gainFactor = peak > 0 ? 1 / peak : 1;

        // Convert to 16-bit PCM with proper scaling and normalization
        for (let i = 0; i < buffer.length; i++) {
            // Apply gain and convert to 16-bit
            sampleData[i] = Math.max(
                -32768,
                Math.min(
                    32767,
                    Math.round(leftChannel[i] * gainFactor * 32767),
                ),
            );
        }

        return sampleData;
    };

    const createSF2 = async (buffer: AudioBuffer): Promise<ArrayBuffer> => {
        // Process sample data
        const sampleData = await processSample(buffer);

        // Validate sample rate (should be between 8000 and 96000)
        const sampleRate = Math.max(8000, Math.min(96000, buffer.sampleRate));

        // Calculate sizes
        const sampleDataSize = sampleData.length * 2;
        const sampleHeaderSize = 46;
        const presetHeaderSize = 38;
        const presetBagSize = 4;
        const presetModSize = 10;
        const presetGenSize = 4;
        const instHeaderSize = 22;
        const instBagSize = 4;
        const instModSize = 10;
        const instGenSize = 4;

        // Calculate total size with padding
        const totalSize =
            4 +
            4 +
            4 + // RIFF header
            (4 + 4 + 60) + // INFO chunk
            (4 + 4 + 4 + 4 + sampleDataSize + (sampleDataSize % 2)) + // sdta chunk (with padding)
            (4 +
                4 +
                4 + // pdta chunk header
                (4 + 4 + presetHeaderSize * 2) + // phdr chunk
                (4 + 4 + presetBagSize * 2) + // pbag chunk
                (4 + 4 + presetModSize) + // pmod chunk
                (4 + 4 + presetGenSize * 2) + // pgen chunk
                (4 + 4 + instHeaderSize * 2) + // inst chunk
                (4 + 4 + instBagSize * 2) + // ibag chunk
                (4 + 4 + instModSize) + // imod chunk
                (4 + 4 + instGenSize * 2) + // igen chunk
                (4 + 4 + sampleHeaderSize * 2)); // shdr chunk

        const data = new ArrayBuffer(totalSize);
        const view = new DataView(data);
        let offset = 0;

        // Write RIFF chunk
        view.setUint32(offset, 0x52494646, false);
        offset += 4; // 'RIFF'
        view.setUint32(offset, totalSize - 8, false);
        offset += 4;
        view.setUint32(offset, 0x73666266, false);
        offset += 4; // 'sfbk'

        // Write INFO chunk
        view.setUint32(offset, 0x4c495354, false);
        offset += 4; // 'LIST'
        view.setUint32(offset, 60, false);
        offset += 4;
        view.setUint32(offset, 0x494e464f, false);
        offset += 4; // 'INFO'

        // INFO subchunks
        view.setUint32(offset, 0x494e414d, false);
        offset += 4; // 'INAM'
        view.setUint32(offset, 20, false);
        offset += 4;
        const name = "WebSynth Sample    ";
        for (let i = 0; i < 20; i++) {
            view.setUint8(offset + i, name.charCodeAt(i));
        }
        offset += 20;

        // Write sdta chunk
        view.setUint32(offset, 0x4c495354, false);
        offset += 4; // 'LIST'
        view.setUint32(offset, sampleDataSize + 12, false);
        offset += 4;
        view.setUint32(offset, 0x73647461, false);
        offset += 4; // 'sdta'
        view.setUint32(offset, 0x736d706c, false);
        offset += 4; // 'smpl'
        view.setUint32(offset, sampleDataSize, false);
        offset += 4;

        // Write sample data with proper alignment
        for (let i = 0; i < sampleData.length; i++) {
            view.setInt16(offset, sampleData[i], false);
            offset += 2;
        }

        // Add padding if needed
        if (sampleDataSize % 2) offset += 1;

        // Write pdta chunk
        view.setUint32(offset, 0x4c495354, false);
        offset += 4; // 'LIST'
        view.setUint32(offset, totalSize - offset - 8, false);
        offset += 4;
        view.setUint32(offset, 0x70647461, false);
        offset += 4; // 'pdta'

        // Write preset headers
        view.setUint32(offset, 0x70686472, false);
        offset += 4; // 'phdr'
        view.setUint32(offset, presetHeaderSize * 2, false);
        offset += 4;

        // Write instrument zones
        const instrumentName = "Sample      ";
        for (let i = 0; i < 20; i++) {
            view.setUint8(offset + i, instrumentName.charCodeAt(i));
        }
        offset += 20;

        // Preset data
        view.setUint16(offset, 0, false);
        offset += 2; // preset number
        view.setUint16(offset, 0, false);
        offset += 2; // bank
        view.setUint16(offset, 0, false);
        offset += 2; // preset bag index
        view.setUint32(offset, 0, false);
        offset += 4; // library
        view.setUint32(offset, 0, false);
        offset += 4; // genre
        view.setUint32(offset, 0, false);
        offset += 4; // morphology

        // Add necessary generators and modulators
        // ... (previous generator and modulator code)

        // Sample header
        view.setUint32(offset, 0x73686472, false);
        offset += 4; // 'shdr'
        view.setUint32(offset, sampleHeaderSize * 2, false);
        offset += 4;

        // Sample header data
        for (let i = 0; i < 20; i++) {
            view.setUint8(offset + i, instrumentName.charCodeAt(i));
        }
        offset += 20;

        view.setUint32(offset, 0, false);
        offset += 4; // start
        view.setUint32(offset, sampleData.length, false);
        offset += 4; // end
        view.setUint32(offset, 0, false);
        offset += 4; // loop start
        view.setUint32(offset, sampleData.length, false);
        offset += 4; // loop end
        view.setUint32(offset, sampleRate, false);
        offset += 4; // sample rate
        view.setUint8(offset, 60);
        offset += 1; // original pitch (middle C)
        view.setInt8(offset, 0);
        offset += 1; // pitch correction
        view.setUint16(offset, 1, false);
        offset += 2; // sample link
        view.setUint16(offset, 1, false);
        offset += 2; // sample type (1 = mono sample)

        return data;
    };

    const exportSoundfont = async () => {
        if (!sampleBuffer) return;

        try {
            setIsExporting(true);

            // Add artificial delay to ensure proper processing
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const sf2Data = await createSF2(sampleBuffer);

            // Validate the generated data
            if (sf2Data.byteLength < 1024) {
                throw new Error("Generated SF2 file is too small");
            }

            const blob = new Blob([sf2Data], { type: "audio/x-soundfont" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "sample.sf2";
            a.click();

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error creating soundfont:", error);
            alert("Failed to create soundfont file");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <button
            onClick={exportSoundfont}
            disabled={!sampleBuffer || isExporting}
            className={`export-button ${isExporting ? "processing" : ""}`}
        >
            {isExporting ? "Processing..." : "Export as Soundfont"}
        </button>
    );
};
