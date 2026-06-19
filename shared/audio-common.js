window.AudioToolUtils = (() => {
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    function downmixBuffer(buffer) {
        const channels = buffer.numberOfChannels;
        if (channels === 1) return buffer;

        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const monoBuffer = ctx.createBuffer(1, length, sampleRate);
        const monoData = monoBuffer.getChannelData(0);

        const channelDatas = [];
        for (let c = 0; c < channels; c++) {
            channelDatas.push(buffer.getChannelData(c));
        }

        for (let i = 0; i < length; i++) {
            let sumSq = 0;
            for (let c = 0; c < channels; c++) {
                sumSq += channelDatas[c][i] * channelDatas[c][i];
            }
            monoData[i] = Math.sqrt(sumSq / channels);
        }
        return monoBuffer;
    }

    function encodeWAV(channelDataList, sampleRate) {
        const numChannels = channelDataList.length;
        const numSamples = channelDataList[0].length;

        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = numSamples * blockAlign;
        const bufferSize = 44 + dataSize;

        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');

        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const pcmData = new Int16Array(buffer, 44, numSamples * numChannels);

        for (let i = 0; i < numSamples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let s = channelDataList[ch][i];
                if (s > 1) s = 1;
                if (s < -1) s = -1;
                s = s < 0 ? s * 0x8000 : s * 0x7FFF;
                pcmData[i * numChannels + ch] = s;
            }
        }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    return { readFileAsArrayBuffer, downmixBuffer, encodeWAV, floatTo16BitPCM, writeString };
})();
