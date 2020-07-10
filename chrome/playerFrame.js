const MOODLE_ORIGIN = 'https://l.xmu.edu.my'
window.addEventListener('message', e => {
    const { type = '' } = e.data
    switch (type) {
        case 'play':
            document.querySelector('button.play-button').click()
            e.stopImmediatePropagation()
            break
        case 'blank':
            location.href = 'about:blank'
            break
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
        $exit.classList.remove('exitFullscreen')
        /**
         * @param {boolean} state 
         * @returns {(e: MouseEvent) => void}
         */
        const onToggleFullscreen = state => e => {
            e.preventDefault()
            $exit.classList.toggle('ui-state-disabled')
            $enter.classList.toggle('ui-state-disabled')
            window.parent.postMessage({ type: 'requestFullscreen', state }, MOODLE_ORIGIN)
        }
        $enter.addEventListener('click', onToggleFullscreen(true))
        $exit.addEventListener('click', onToggleFullscreen(false))

    } else {
        console.log('fullscreen allowed or outside a iframe')
    }
}

function listenOnDialog() {
    function onTicketError() {
        console.log('On ticket error')
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'requestFixCookie' }, MOODLE_ORIGIN)
        }
    }
    const observer = new MutationObserver(e => {
        for (const ev of e) {
            for (const n of ev.addedNodes) {
                if (n.getAttribute('aria-describedby') === 'MessageDisplay') {
                    observer.disconnect()
                    const $msg = document.getElementById('MessageDisplay')
                    if ($msg.innerText === '数据库中不存在票证。'
                        || $msg.innerText === 'The ticket does not exist in the database.') {
                        onTicketError()
                        return
                    }
                }
            }
        }
    })
    observer.observe(document.body, {
        childList: true,
        subtree: false
    })
}

function listenOnControls() {
    const observer = new MutationObserver(e => {
        /** @type {HTMLButtonElement} */
        const $rateBtn = document.querySelector('button.rate.ui-button')
        if ($rateBtn) {
            observer.disconnect()
            $rateBtn.addEventListener('contextmenu', e => {
                e.preventDefault()
                const rate = parseFloat(prompt('Custom playback speed rate'))
                if (!Number.isNaN(rate) && rate > 0.09 && rate < 15) {
                    for (const $video of document.querySelectorAll('video')) {
                        $video.playbackRate = rate
                    }
                }
            })
        }
    })
    const $playerContent = document.getElementById('PlayerContent')
    if ($playerContent) {
        observer.observe($playerContent, {
            childList: true,
            subtree: true
        })
    }
}

// Skip intermediate pages
if (document.getElementsByTagName('main').length > 0) {
    attachFullscreen()
    listenOnDialog()
    listenOnControls()
}
