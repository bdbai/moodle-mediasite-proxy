// TODO: replace this ad-hoc fragile solution
const $mediaLis = Array
    .from(document.querySelectorAll('#intro div h3 + a[href^="https://l.xmu.edu.my/mod/mediasite/content_launch.php?"]'))

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = customLandingUrl => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    customLandingUrl
}, resolve))

/**
 * @type {Promise<boolean>}
 */
const extractInfoAsync = new Promise((resolve, _reject) =>
    chrome.storage.sync.get({ extractInfo: true }, ({ extractInfo }) => resolve(extractInfo)))

/**
 * 
 * @param {Element} $a
 */
async function collectFromGetPlayerOptions($a) {
    if (!await extractInfoAsync) {
        return
    }
    const playerOptions = await getPlayerOptionsAsync($a.href)
    const {
        coverages, // second!
        duration,
        bookmark // second!
    } = playerOptions

    const $p = $a.parentElement.querySelector('p')
    const $con = document.createElement('div')

    // Append media info
    const $urlCon = document.createElement('p')
    const $unwatchedCon = document.createElement('p')
    attachMediaInfo(playerOptions, { $con: $urlCon, titleEl: 'strong', $unwatchedCon })

    $con.appendChild($urlCon)

    // Append unwatched periods
    const totalSeconds = Math.floor(duration / 1e3)
    const unwatchedPeriods = convertCoverageToUnwatched(coverages, totalSeconds)
    const coveredSeconds = totalSeconds - unwatchedPeriods.map(([a, b]) => b - a).reduce((p, c) => p + c, 0)

    $con.appendChild($unwatchedCon)

    // Show bookmark position
    let appendix = ' '
    if (bookmark && bookmark.position) {
        const { position } = bookmark
        const progress = position / duration * 1000
        appendix += `[bookmark at ${
            Math.floor(position / 60)}:${
            Math.floor(position % 60)}(${
            progress.toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })})] `
    }
    const $instanceNameNode = $a.parentElement.querySelector('h3 a:last-child')
    const $instanceNameTextNode = $instanceNameNode.childNodes[0]

    // Unwatched periods
    appendix += `[Est. completeness = ${
        Math.min(1, coveredSeconds / totalSeconds)
            .toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })
        }]`
    $instanceNameNode.setAttribute('data-original-text', $instanceNameTextNode.textContent)
    $instanceNameTextNode.textContent += appendix //` [bookmark at 1:3(5%)][Est. completeness = %]`
    $p.before($con)

    drawProgressOnce(
        $c => $a.parentElement.querySelector('h3').after($c),
        unwatchedPeriods,
        bookmark,
        totalSeconds,
        duration
    )
}

!function () {
    // Collect information from GetPlayerOptions
    extractInfoAsync.then(extractInfo => extractInfo
        && Promise.all($mediaLis.map(collectFromGetPlayerOptions)))
}()
