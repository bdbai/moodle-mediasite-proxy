const MOODLE_ORIGIN = 'https://l.xmu.edu.my'
const CONTINUOUS_PLAY_ON_SESSION_KEY = 'continuousPlayOn'
const PLAYBACK_RATE_SESSION_KEY = 'playbackRate'
let autoPlayEnabled = false
let continuousPlayEnabled = false
window.addEventListener('message', e => {
    const { type = '' } = e.data
    switch (type) {
        case 'play':
            autoPlayEnabled = true
            continuousPlayEnabled = e.data.continuousPlayEnabled
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

/**
 * @param {HTMLDivElement | null} $player
 */
function listenOnPlaybackEnd($player) {
    if (!$player) {
        return
    }

    let enterPresentationEnded = () => { }
    let leavePresentationEnded = () => { }

    function injectWhenContinuousPlayOff() {
        enterPresentationEnded = () => { }
        leavePresentationEnded = () => { }
        /** @type {HTMLDivElement} */
        const $btnCon = document.querySelector('div.modals div.preso-ended-buttons')
        $btnCon.style.display = 'flex'
        /** @type {HTMLButtonElement} */
        const $btn = $btnCon.children[0].cloneNode(false)
        $btn.innerHTML = '<span class="ui-blur-image" style="width: 30px;height: 30px;"><img class="foreground" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABmJLR0QA/wD/AP+gvaeTAAABmUlEQVRoge2Zv0oEMRCHvxMFwep6/1W2lnIccncPYWGhvoKdlXilhU8gKCiC4FMIImppY2MlV1haCYLgWQRB4+2wm5vZ7C35IEUgOzs/kl8mJJBIJBKTRCPHmB6wBSwY55LFADgHrscJ0geGFWkHoSJ6FUjeb52sZKcEIdvFdJdCZk7TwkeLXv+SMddpAF1g81d/OWugJMSfrVvgODilMGb4KyRzBUlLa6JIQqpGEjKCJjCrGK8QmkJWgWfcXp/n6KOK9tKaB86AO6ClHFvEyiNruLpzxf/CaoKl2RvABvCEO3ya+qeMXWsOd3I19U+Z26+pf2LUERP/xCqI6v6pTWWXjvGWDIELYA941QgYQ8gDsAvcawYtc2kNgB3cjqUqAsqZkXfgCDgEPqx+YilE3QcSVkJMfCCh7RFTH0hozsgjsIKhDyQ0hbwpxipMbSp7ElI1aiNEMvuX128Dn4a5jKLt9f2ccnFK/PcQv52ECOlWIHG/rYcIAXdpEDv5n7YvJZrnRqODewxdyjHWghfcpcVNpP8nEomEAd9uVeQZz4WbQgAAAABJRU5ErkJggg==" alt="" style="filter: invert(1);"><img class="background double-background" alt="" style="display: none; position: absolute; inset: -10px; width: 20px; height: 50px;"><img class="background" alt="" style="display: none; position: absolute; inset: -10px; width: 20px; height: 50px;"></span><span class="ui-button-text">Autoplay Next</span>'
        $btn.addEventListener('click', _e => {
            sessionStorage.setItem(CONTINUOUS_PLAY_ON_SESSION_KEY, true)
            window.parent.postMessage({ type: 'jumpNext' }, MOODLE_ORIGIN)
        })
        $btnCon.appendChild($btn)
    }

    function injectWhenContinuousPlayOn() {
        /** @type {HTMLDivElement} */
        const $btnCon = document.querySelector('div.modals div.preso-ended-buttons')
        $btnCon.style.display = 'flex'
        /** @type {HTMLButtonElement} */
        const $btn = $btnCon.children[0].cloneNode(false)
        $btn.innerHTML = '<span class="ui-blur-image" style="width: 30px;height: 30px;"><img class="foreground" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABmJLR0QA/wD/AP+gvaeTAAABmUlEQVRoge2Zv0oEMRCHvxMFwep6/1W2lnIccncPYWGhvoKdlXilhU8gKCiC4FMIImppY2MlV1haCYLgWQRB4+2wm5vZ7C35IEUgOzs/kl8mJJBIJBKTRCPHmB6wBSwY55LFADgHrscJ0geGFWkHoSJ6FUjeb52sZKcEIdvFdJdCZk7TwkeLXv+SMddpAF1g81d/OWugJMSfrVvgODilMGb4KyRzBUlLa6JIQqpGEjKCJjCrGK8QmkJWgWfcXp/n6KOK9tKaB86AO6ClHFvEyiNruLpzxf/CaoKl2RvABvCEO3ya+qeMXWsOd3I19U+Z26+pf2LUERP/xCqI6v6pTWWXjvGWDIELYA941QgYQ8gDsAvcawYtc2kNgB3cjqUqAsqZkXfgCDgEPqx+YilE3QcSVkJMfCCh7RFTH0hozsgjsIKhDyQ0hbwpxipMbSp7ElI1aiNEMvuX128Dn4a5jKLt9f2ccnFK/PcQv52ECOlWIHG/rYcIAXdpEDv5n7YvJZrnRqODewxdyjHWghfcpcVNpP8nEomEAd9uVeQZz4WbQgAAAABJRU5ErkJggg==" alt="" style="filter: invert(1);"><img class="background double-background" alt="" style="display: none; position: absolute; inset: -10px; width: 20px; height: 50px;"><img class="background" alt="" style="display: none; position: absolute; inset: -10px; width: 20px; height: 50px;"></span><span class="ui-button-text">Stop Autoplay (<span class="countdown">10</span>)</span>'

        enterPresentationEnded = () => {
            /** @type {HTMLSpanElement} */
            const $countdown = $btn.getElementsByClassName('countdown')[0]
            let secondsRemaining = 10
            $countdown.innerText = secondsRemaining.toString()
            const countdownHandle = setInterval(() => {
                if (secondsRemaining-- === 0) {
                    clearInterval(countdownHandle)
                    window.parent.postMessage({ type: 'jumpNext' }, MOODLE_ORIGIN)
                } else {
                    $countdown.innerText = secondsRemaining.toString()
                }
            }, 1000)
            /**
             * @param {MouseEvent} _e 
             */
            const cancelBtnClick = _e => {
                clearInterval(countdownHandle)
                sessionStorage.removeItem(CONTINUOUS_PLAY_ON_SESSION_KEY)
                $btn.remove()
                injectWhenContinuousPlayOff()
            }
            $btn.addEventListener('click', cancelBtnClick)

            leavePresentationEnded = () => {
                clearInterval(countdownHandle)
                $btn.removeEventListener('click', cancelBtnClick)
            }
        }

        $btnCon.appendChild($btn)
    }

    let ended = false, btnInjected = false
    const observer = new MutationObserver(_e => {
        if (!ended && $player.classList.contains('presentation-ended')) {
            ended = true
            if (!btnInjected) {
                btnInjected = true
                if (sessionStorage.getItem(CONTINUOUS_PLAY_ON_SESSION_KEY)) {
                    injectWhenContinuousPlayOn()
                } else {
                    injectWhenContinuousPlayOff()
                }
            }
            enterPresentationEnded()
        } else if (ended && !$player.classList.contains('presentation-ended')) {
            ended = false
            leavePresentationEnded()
        }
    })
    observer.observe($player, {
        attributeFilter: ['class'],
        attributes: true,
        subtree: false
    })
}

function listenOnControls() {
    let rateBtnListening = false, videoListening = false
    const observer = new MutationObserver(_e => {
        /** @type {HTMLButtonElement} */
        const $rateBtn = document.querySelector('button.rate.ui-button')
        if (!rateBtnListening && $rateBtn) {
            rateBtnListening = true
            $rateBtn.addEventListener('mouseenter', function rateBtnMouseEnter(_e) {
                if ($rateBtn.title === '调整播放速率') {
                    $rateBtn.title += '（右键自定义）'
                } else {
                    $rateBtn.title += ' (Right click to customize playback rate)'
                }
                $rateBtn.removeEventListener('mouseenter', rateBtnMouseEnter)
            })
            $rateBtn.addEventListener('contextmenu', e => {
                e.preventDefault()
                const $video = document.querySelector('video')
                if (!$video) {
                    return
                }
                const originalRate = Math.round($video.playbackRate * 100) / 100
                const rate = parseFloat(prompt('Custom playback speed rate', originalRate.toString()))
                if (!Number.isNaN(rate) && rate > 0.09 && rate <= 15) {
                    $video.playbackRate = rate
                }
            })
        }
        const $video = document.querySelector('video')
        if (!videoListening && $video) {
            videoListening = true
            $video.autoplay = autoPlayEnabled
            const initialPlaybackRate = parseFloat(sessionStorage.getItem(PLAYBACK_RATE_SESSION_KEY))
            if (!Number.isNaN(initialPlaybackRate)) {
                $video.addEventListener('playing', function videoPlaying(_e) {
                    setTimeout(() => {
                        $video.playbackRate = initialPlaybackRate
                        $video.addEventListener('ratechange', _e => {
                            sessionStorage.setItem(PLAYBACK_RATE_SESSION_KEY, $video.playbackRate.toString())
                        })
                    }, 400)
                    $video.removeEventListener('playing', videoPlaying)
                })
            } else {
                $video.addEventListener('ratechange', _e => {
                    sessionStorage.setItem(PLAYBACK_RATE_SESSION_KEY, $video.playbackRate.toString())
                })
            }

            const initialFullscreen = sessionStorage.getItem(FULLSCREEN_SESSION_KEY) === '1'
            if (autoPlayEnabled && initialFullscreen && document.fullscreenEnabled) {
                try {
                    document.documentElement.requestFullscreen()
                } catch (_e) {
                    // FullScreen error, user gesture is not present
                }
            }
            document.addEventListener('fullscreenchange', _e => {
                if (document.fullscreenElement) {
                    sessionStorage.setItem(FULLSCREEN_SESSION_KEY, '1')
                } else {
                    sessionStorage.removeItem(FULLSCREEN_SESSION_KEY)
                }
            })
        }
        if (rateBtnListening && videoListening) {
            if (continuousPlayEnabled) {
                listenOnPlaybackEnd(document.querySelector('#PlayerContent > div.player'))
            }
            observer.disconnect()
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
