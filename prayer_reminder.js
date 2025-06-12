// ==UserScript==
// @name         Torn City Prayer Reminder
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Reminds you to pray at the church in Torn City at configurable times (browser & Torn PDA). Supports manual times and auto interval snooze.
// @author       YourName
// @match        https://www.torn.com/*
// @icon         https://www.torn.com/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- Config ---
    const defaultNotificationTimes = ["09:00", "21:00"];
    const emoji = "🙏";
    const tooltipBase = "Prayer Reminder: ";
    const churchUrl = "https://www.torn.com/church.php";

    let isReallyTornPDA = false;

    // --- Storage helpers ---
    function getNotificationTimes() {
        const times = JSON.parse(localStorage.getItem('prayerReminderNotificationTimes'));
        return times || defaultNotificationTimes;
    }
    function setNotificationTimes(times) {
        localStorage.setItem('prayerReminderNotificationTimes', JSON.stringify(times));
    }

    function getIntervalSettings() {
        return JSON.parse(localStorage.getItem('prayerReminderIntervalSettings')) || {
            enabled: false,
            hours: 2,
            start: "08:00",
            snoozedUntil: null
        };
    }
    function setIntervalSettings(settings) {
        localStorage.setItem('prayerReminderIntervalSettings', JSON.stringify(settings));
    }

    // --- Environment detection (async for Torn PDA) ---
    function detectTornPDA(callback) {
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('isTornPDA')
                .then(response => {
                    isReallyTornPDA = response && response.isTornPDA;
                    if (callback) callback();
                })
                .catch(() => {
                    isReallyTornPDA = false;
                    if (callback) callback();
                });
        } else {
            isReallyTornPDA = false;
            if (callback) callback();
        }
    }

    // --- Notification ---
    function showPrayerNotification() {
        if (isReallyTornPDA) {
            if (window.TornPDA && window.TornPDA.notification && window.TornPDA.notification.toast) {
                window.TornPDA.notification.toast({
                    message: "Don't forget to pray at the church today!",
                    duration: 5000,
                    icon: "https://www.torn.com/favicon.ico",
                    onClick: function () {
                        window.location.href = churchUrl;
                    }
                });
            } else if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                window.flutter_inappwebview.callHandler('scheduleNotification', {
                    title: 'Torn City Prayer Reminder',
                    id: 9999,
                    timestamp: Date.now() + 1000,
                    launchNativeToast: true,
                    toastMessage: 'Don\'t forget to pray at the church today!',
                    toastColor: 'blue',
                    toastDurationSeconds: 3,
                    urlCallback: churchUrl
                });
            } else {
                alert("Don't forget to pray at the church today!\n\n" + churchUrl);
            }
        } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const notification = new Notification("Torn City Prayer Reminder", {
                body: "Don't forget to pray at the church today!",
                icon: "https://www.torn.com/favicon.ico"
            });
            notification.onclick = function (event) {
                event.preventDefault();
                window.open(churchUrl, "_blank");
            };
        } else if (typeof Notification === "undefined") {
            alert("Don't forget to pray at the church today!\n\n" + churchUrl);
        }
    }

    // --- PDA Scheduling Helpers ---
    function schedulePDA(type, time, id) {
        // time: "HH:MM", id: integer (unique per notification)
        const now = new Date();
        const [hour, minute] = time.split(":").map(Number);
        let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
        if (target < now) target.setDate(target.getDate() + 1); // schedule for next day if time has passed
        const timestamp = target.getTime();

        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('scheduleNotification', {
                title: 'Torn City Prayer Reminder',
                id: id,
                timestamp: timestamp,
                launchNativeToast: true,
                toastMessage: 'Prayer notification scheduled!',
                toastColor: 'blue',
                toastDurationSeconds: 3,
                urlCallback: churchUrl
            });
        }
    }

    function cancelPDANotification(id) {
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('cancelNotification', { id: id });
        }
    }

    // --- Check time ---
    function checkPrayerTime() {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
        const notificationTimes = getNotificationTimes();

        // Manual notification times
        if (notificationTimes.includes(currentTime)) {
            showPrayerNotification();
        }

        // Interval notification
        const intervalSettings = getIntervalSettings();
        if (intervalSettings.enabled) {
            // Check snooze
            if (intervalSettings.snoozedUntil) {
                const snoozeDate = new Date(intervalSettings.snoozedUntil);
                if (now < snoozeDate) return; // Snoozed
            }
            // Calculate next interval
            const [startHour, startMinute] = intervalSettings.start.split(":").map(Number);
            let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute, 0, 0);
            if (now < start) return; // Not started yet today

            const msSinceStart = now - start;
            const intervalMs = intervalSettings.hours * 60 * 60 * 1000;
            if (msSinceStart >= 0 && (msSinceStart % intervalMs) < 60000) { // within this minute
                showPrayerNotification();
            }
        }
    }

    // --- Prayer icon in sidebar ---
    function updatePrayerIconTooltip() {
        const icon = document.getElementById('prayer-reminder-icon');
        if (icon) {
            const notificationTimes = getNotificationTimes();
            const intervalSettings = getIntervalSettings();
            let tip = tooltipBase;
            tip += "\nNotifications: " + (notificationTimes.length ? notificationTimes.join(", ") : "None");
            if (intervalSettings.enabled) {
                tip += `\nAuto: Every ${intervalSettings.hours}h from ${intervalSettings.start}`;
                if (intervalSettings.snoozedUntil) {
                    tip += ` (snoozed until ${new Date(intervalSettings.snoozedUntil).toLocaleString()})`;
                }
            }
            icon.title = tip;
        }
    }

    function addPrayerIconToSidebar() {
        const statusIcons = document.querySelector('ul[class*="status-icons"]');
        if (!statusIcons) return;
        if (document.getElementById('prayer-reminder-icon')) return;

        const iconSettings = JSON.parse(localStorage.getItem('prayerReminderIconSettings')) || {
            position: "end",
            offset: 2
        };

        const li = document.createElement('li');
        li.className = 'icon-prayer-reminder';
        const a = document.createElement('a');
        a.href = "#";
        a.id = "prayer-reminder-icon";
        a.setAttribute('aria-label', 'Prayer Reminder');
        a.setAttribute('tabindex', '0');
        a.style.fontSize = "17px";
        a.style.width = "17px";
        a.style.height = "17px";
        a.style.lineHeight = "17px";
        a.style.display = "flex";
        a.style.alignItems = "center";
        a.style.justifyContent = "center";
        a.textContent = emoji;

        updatePrayerIconTooltip();

        a.addEventListener('click', function (e) {
            e.preventDefault();
            openPrayerConfigUI();
        });

        li.appendChild(a);

        // Apply position settings
        if (iconSettings.position === "beginning") {
            statusIcons.insertBefore(li, statusIcons.firstChild);
        } else {
            const children = statusIcons.children;
            const position = Math.max(0, children.length - iconSettings.offset);
            statusIcons.insertBefore(li, children[position] || null);
        }
    }

    // --- UI for setting times (add/remove/interval) ---
    function openPrayerConfigUI() {
        if (!isReallyTornPDA && typeof Notification !== "undefined" && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        let modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.background = '#222';
        modal.style.color = '#fff';
        modal.style.padding = '24px';
        modal.style.borderRadius = '8px';
        modal.style.zIndex = 99999;
        modal.style.boxShadow = '0 2px 12px #0008';
        modal.style.minWidth = '280px';
        modal.style.textAlign = 'center';

        const intervalSettings = getIntervalSettings();
        const iconSettings = JSON.parse(localStorage.getItem('prayerReminderIconSettings')) || {
            position: "end",
            offset: 2
        };

        modal.innerHTML = `
            <div style="margin-bottom:10px;font-size:18px;">Prayer Reminder Settings</div>
            <div style="margin-bottom:10px;">
                <b>Notification Times:</b><br>
                <span id="prayer-notification-times"></span>
            </div>
            <div style="margin-bottom:10px;">
                <label>
                    <input type="checkbox" id="auto-interval-toggle" ${intervalSettings.enabled ? "checked" : ""}>
                    Enable auto interval notification
                </label>
                <div id="interval-settings" style="margin-top:8px;${intervalSettings.enabled ? "" : "display:none;"}">
                    Every <input id="interval-hours" type="number" min="1" max="24" value="${intervalSettings.hours}" style="width:40px;"> hour(s)
                    <br>Start at <input id="interval-start" type="time" value="${intervalSettings.start}" style="width:90px;">
                </div>
            </div>
            <div style="margin-bottom:10px;">
                <b>Icon Position:</b><br>
                <label>
                    <input type="radio" name="icon-position" value="beginning" ${iconSettings.position === "beginning" ? "checked" : ""}> Beginning
                </label>
                <label>
                    <input type="radio" name="icon-position" value="end" ${iconSettings.position === "end" ? "checked" : ""}> End
                </label>
                <br>
                Offset from end: <input id="icon-offset" type="number" min="0" value="${iconSettings.offset}" style="width:40px;">
            </div>
            <button id="add-notification-time" style="margin:4px;">Add Notification Time</button>
            <button id="close-prayer-modal" style="margin:4px;">Close</button>
        `;

        document.body.appendChild(modal);

        function renderTimes() {
            const notifTimes = getNotificationTimes();
            const notifSpan = modal.querySelector('#prayer-notification-times');
            notifSpan.innerHTML = notifTimes.length
                ? notifTimes.map((t, i) =>
                    `<span style="margin-right:6px;">${t} <button data-type="notification" data-index="${i}" style="font-size:10px;">✖</button></span>`
                ).join("")
                : "None";
        }
        renderTimes();

        modal.querySelector('#add-notification-time').onclick = function () {
            let input = prompt("Enter a notification time (24h format, e.g. 09:00):");
            if (input && /^\d{2}:\d{2}$/.test(input.trim())) {
                let times = getNotificationTimes();
                if (!times.includes(input.trim())) {
                    times.push(input.trim());
                    setNotificationTimes(times);
                    updatePrayerIconTooltip();
                    renderTimes();
                    if (isReallyTornPDA && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                        schedulePDA("notification", input.trim(), 1000 + times.length);
                    }
                }
            }
        };

        modal.addEventListener('click', function (e) {
            if (e.target.tagName === "BUTTON" && e.target.dataset.type === "notification") {
                const idx = parseInt(e.target.dataset.index, 10);
                let times = getNotificationTimes();
                times.splice(idx, 1);
                setNotificationTimes(times);
                updatePrayerIconTooltip();
                renderTimes();
                if (isReallyTornPDA && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                    cancelPDANotification(1000 + idx + 1);
                }
            }
        });

        const intervalToggle = modal.querySelector('#auto-interval-toggle');
        const intervalDiv = modal.querySelector('#interval-settings');
        intervalToggle.onchange = function () {
            intervalDiv.style.display = intervalToggle.checked ? "" : "none";
            let settings = getIntervalSettings();
            settings.enabled = intervalToggle.checked;
            setIntervalSettings(settings);
            updatePrayerIconTooltip();
        };
        modal.querySelector('#interval-hours').onchange = function () {
            let settings = getIntervalSettings();
            settings.hours = Math.max(1, parseInt(this.value, 10) || 1);
            setIntervalSettings(settings);
            updatePrayerIconTooltip();
        };
        modal.querySelector('#interval-start').onchange = function () {
            let settings = getIntervalSettings();
            settings.start = this.value;
            setIntervalSettings(settings);
            updatePrayerIconTooltip();
        };

        modal.querySelector('#close-prayer-modal').onclick = function () {
            const iconPosition = modal.querySelector('input[name="icon-position"]:checked').value;
            const iconOffset = parseInt(modal.querySelector('#icon-offset').value, 10);

            // Save icon position settings to localStorage
            localStorage.setItem('prayerReminderIconSettings', JSON.stringify({
                position: iconPosition,
                offset: iconOffset
            }));

            alert("Icon position settings updated. Changes will take effect on the next page load.");
            modal.remove();
        };
    }

    // --- Snooze after prayer ---
    function setupSnoozeOnPrayer() {
        // Listen for prayer button on church page
        if (window.location.pathname === "/church.php") {
            const observer = new MutationObserver(() => {
                const praySpan = document.querySelector('span[action="pray"]');
                const prayBtn = praySpan ? praySpan.querySelector('button') : null;

                if (prayBtn && !prayBtn.dataset.prayerSnoozeAttached) {
                    prayBtn.dataset.prayerSnoozeAttached = "1";
                    prayBtn.addEventListener('click', function () {
                        setTimeout(() => {
                            // After prayer, ask to snooze
                            const intervalSettings = getIntervalSettings();
                            if (intervalSettings.enabled) {
                                if (confirm("Snooze prayer notifications until tomorrow at " + intervalSettings.start + "?")) {
                                    // Set snooze until next start time
                                    const now = new Date();
                                    const [h, m] = intervalSettings.start.split(":").map(Number);
                                    let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
                                    if (now >= next) next.setDate(next.getDate() + 1);
                                    intervalSettings.snoozedUntil = next.toISOString();
                                    setIntervalSettings(intervalSettings);
                                    updatePrayerIconTooltip();
                                }
                            }
                        }, 500); // Wait for prayer to process
                    });
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // --- Main ---
    function main() {
        detectTornPDA(() => {
            const tryAddIcon = () => {
                addPrayerIconToSidebar();
                if (!document.getElementById('prayer-reminder-icon')) {
                    setTimeout(tryAddIcon, 1000);
                }
            };
            tryAddIcon();
            setInterval(checkPrayerTime, 60000);
            setupSnoozeOnPrayer();
        });
    }

    main();
})();