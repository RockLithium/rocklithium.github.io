window.PerfTestUtils = (() => {
    function createLogger(logDiv) {
        return function log(msg, type = 'normal') {
            const span = document.createElement('div');
            span.textContent = msg;
            span.className = type;
            logDiv.appendChild(span);
            logDiv.scrollTop = logDiv.scrollHeight;
        };
    }

    function getRobustGPUName(adapter) {
        let name = "Generic GPU";
        if (adapter.info && adapter.info.description && !adapter.info.description.includes("Generic")) {
            name = adapter.info.description;
        } else {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        const webglName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                        if (webglName) name = webglName;
                    }
                }
            } catch (e) {}
        }
        if (name.startsWith("ANGLE (")) {
            let raw = name.substring(7, name.length - 1);
            let firstComma = raw.indexOf(',');
            if (firstComma !== -1) raw = raw.substring(firstComma + 1).trim();
            let deviceIdIndex = raw.indexOf('(0x');
            if (deviceIdIndex !== -1) {
                name = raw.substring(0, deviceIdIndex).trim();
            } else {
                let trailerComma = raw.indexOf(',');
                name = trailerComma !== -1 ? raw.substring(0, trailerComma).trim() : raw;
            }
        }
        return name;
    }

    return { createLogger, getRobustGPUName };
})();
