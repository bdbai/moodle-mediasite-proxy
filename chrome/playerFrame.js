window.addEventListener('message', e => {
    if (e.data && e.data.type === 'play') {
        document.querySelector('button.play-button').click()
        e.stopImmediatePropagation()
    } else if (e.data && e.data.type === 'refresh') {
        location.reload()
    }
})

// Taken from Mediasite.Player.Core.js
const fullscreenUtility = function () {
    function getOnePropertyFromObject(n, t) {
        for (var i = 0; i < t.length; i += 1)
            if (typeof n[t[i]] != "undefined")
                return n[t[i]]
    }
    return {
        doesBrowserSupportFullscreen: function () {
            var n = document
                , t = getOnePropertyFromObject(n, ["fullscreenEnabled", "webkitFullscreenEnabled", "mozFullScreenEnabled", "msFullscreenEnabled"]);
            return typeof t == "boolean" ? t : !!(n.requestFullscreen || n.webkitRequestFullscreen || n.mozFullScreenElement || n.msFullscreenElement)
        }
    }
}()

if (window.parent !== window && !fullscreenUtility.doesBrowserSupportFullscreen()) {
    console.log('not support fullscreen? check')
    window.parent.postMessage({ type: 'ensureEnableFullscreen' }, 'https://l.xmu.edu.my')
}
