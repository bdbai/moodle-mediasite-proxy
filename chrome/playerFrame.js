window.addEventListener('message', e => {
    if (e.data && e.data.type === 'play') {
        document.querySelector('button.play-button').click()
        e.stopImmediatePropagation()
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

/**
 * @param {number} ms 
 */
const delay = ms => new Promise((resolve, _reject) => setTimeout(resolve, ms))

async function attachFullscreen() {
    if (window.parent !== window && !fullscreenUtility.doesBrowserSupportFullscreen()) {
        console.log('fullscreen not allowed, turn on fullscreen switches manually')
        /** @type {HTMLDivElement} */
        let $generalControl
        do {
            await delay(1000)
            $generalControl = document.querySelector('#PlayerContent div.generalControls')
        }
        while (!$generalControl)
        const left = parseInt($generalControl.style.left)
        $generalControl.style.left = (left - 45) + 'px'

        /** @type {HTMLButtonElement} */
        const $enter = document.querySelector('button.enterFullscreen')
        /** @type {HTMLButtonElement} */
        const $exit = document.querySelector('button.exitFullscreen')

        $enter.classList.remove('ui-state-disabled')
        $enter.classList.remove('enterFullscreen')
        $enter.addEventListener('click', e => {
            e.preventDefault()
            $exit.classList.toggle('ui-state-disabled')
            $enter.classList.toggle('ui-state-disabled')
            window.parent.postMessage({ type: 'requestFullscreen', state: true }, 'https://l.xmu.edu.my')
        })

        $exit.classList.remove('exitFullscreen')
        $exit.addEventListener('click', e => {
            e.preventDefault()
            $exit.classList.toggle('ui-state-disabled')
            $enter.classList.toggle('ui-state-disabled')
            window.parent.postMessage({ type: 'requestFullscreen', state: false }, 'https://l.xmu.edu.my')
        })
    } else {
        console.log('fullscreen are allowed or outside a iframe')
    }
}

// Skip intermediate pages
if (document.getElementsByTagName('main').length > 0) {
    attachFullscreen()
}
