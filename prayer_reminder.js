// ==UserScript==
// @name         Torn City Prayer Reminder
// @namespace    http://tampermonkey.net/
// @version      3.2
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

            // Change icon if snoozed
            if (
                intervalSettings.enabled &&
                intervalSettings.snoozedUntil &&
                new Date(intervalSettings.snoozedUntil) > new Date()
            ) {
                icon.textContent = "💤";
            } else {
                icon.textContent = emoji;                
            }
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
        li.style.background = "none"; // <--- Add this line to remove the green circle

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

        // Now update the icon and tooltip, since it's in the DOM
        updatePrayerIconTooltip();
    }

    // --- Time Parsing Helper ---
    function parseTimeString(timeStr) {
        // Accepts "9:30", "09:30", "9:30 AM", "9:30am", "9:30 pm", "21:30", etc.
        const match = timeStr.trim().match(/^(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)?$/i);
        if (!match) return null;
        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const ampm = match[3] ? match[3].toLowerCase() : null;

        if (ampm) {
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
        }
        return { hour, minute };
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
        modal.style.padding = '28px 24px 20px 24px';
        modal.style.borderRadius = '12px';
        modal.style.zIndex = 99999;
        modal.style.boxShadow = '0 2px 16px #000a';
        modal.style.minWidth = '320px';
        modal.style.textAlign = 'center';
        modal.style.fontSize = '15px';

        const intervalSettings = getIntervalSettings();
        const iconSettings = JSON.parse(localStorage.getItem('prayerReminderIconSettings')) || {
            position: "end",
            offset: 2
        };

        // Helper to format snooze
        function snoozeText() {
            if (!intervalSettings.snoozedUntil) return "None";
            const d = new Date(intervalSettings.snoozedUntil);
            return d.toLocaleString();
        }

        // Helper to format 24h time to 12h
        function to12Hour(time24) {
            const [h, m] = time24.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hour = ((h + 11) % 12 + 1);
            return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
        }

        modal.innerHTML = `
            <div style="margin-bottom:16px;font-size:20px;font-weight:bold;">Prayer Reminder Settings</div>
            <div style="margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #444;">
                <div style="margin-bottom:8px;">
                    <b>Manual Notification Times:</b>
                </div>
                <div id="prayer-notification-times" style="margin-bottom:10px;"></div>
                <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
                    <input id="manual-time-input" type="time" style="width:100px;padding:2px 6px;border-radius:5px;border:1px solid #444;background:#181818;color:#fff;">
                    <button id="add-notification-time" style="padding:4px 12px;border-radius:5px;background:#3a7cff;color:#fff;border:none;cursor:pointer;">Add</button>
                </div>
            </div>
            <div style="margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #444;">
                <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <input type="checkbox" id="auto-interval-toggle" ${intervalSettings.enabled ? "checked" : ""} style="transform:scale(1.2);margin-right:4px;">
                    <span>Enable auto interval notification</span>
                </label>
                <div id="interval-settings" style="margin-top:6px;${intervalSettings.enabled ? "" : "display:none;"}">
                    <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:8px;">
                        <span>Every</span>
                        <input id="interval-hours" type="number" min="1" max="24" value="${intervalSettings.hours}" style="width:48px;padding:2px 6px;border-radius:5px;border:1px solid #444;background:#181818;color:#fff;">
                        <span>hour(s)</span>
                    </div>
                    <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
                        <span>Start at</span>
                        <input id="interval-start" type="time" value="${intervalSettings.start}" style="width:100px;padding:2px 6px;border-radius:5px;border:1px solid #444;background:#181818;color:#fff;">
                    </div>
                </div>
            </div>
            <div style="margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #444;">
                <div style="margin-bottom:8px;">
                    <b>Snooze:</b>
                </div>
                <div style="margin-bottom:8px;">
                    <span>Current snooze: <span id="current-snooze">${snoozeText()}</span></span>
                </div>
                <button id="toggle-snooze-btn" style="padding:4px 12px;border-radius:5px;background:#ffb13a;color:#222;border:none;cursor:pointer;">
                    ${intervalSettings.snoozedUntil ? "Unset Snooze" : "Snooze Until Next Interval"}
                </button>
            </div>
            <div style="margin-bottom:18px;">
                <b>Icon Position:</b><br>
                <label style="margin-right:12px;">
                    <input type="radio" name="icon-position" value="beginning" ${iconSettings.position === "beginning" ? "checked" : ""}> Beginning
                </label>
                <label>
                    <input type="radio" name="icon-position" value="end" ${iconSettings.position === "end" ? "checked" : ""}> End
                </label>
                <br>
                <span style="margin-right:4px;">Offset from end:</span>
                <input id="icon-offset" type="number" min="0" value="${iconSettings.offset}" style="width:48px;padding:2px 6px;border-radius:5px;border:1px solid #444;background:#181818;color:#fff;" ${iconSettings.position === "beginning" ? "disabled" : ""}>
            </div>
            <div style="display:flex;justify-content:center;gap:12px;">
                <button id="cancel-prayer-modal" style="padding:6px 18px;border-radius:5px;background:#666;color:#fff;border:none;cursor:pointer;">Cancel</button>
                <button id="close-prayer-modal" style="padding:6px 18px;border-radius:5px;background:#444;color:#fff;border:none;cursor:pointer;">Save</button>
            </div>
            <div style="margin-top:10px;font-size:12px;color:#aaa;">
                All changes are saved instantly.<br>
                <b>Save</b> will refresh the page to apply icon position.<br>
                <b>Cancel</b> closes this window but does not undo changes.
            </div>
        `;

        document.body.appendChild(modal);

        function renderTimes() {
            const notifTimes = getNotificationTimes();
            const notifSpan = modal.querySelector('#prayer-notification-times');
            notifSpan.innerHTML = notifTimes.length
                ? notifTimes.map((t, i) =>
                    `<span style="margin-right:8px;display:inline-flex;align-items:center;background:#333;padding:2px 8px;border-radius:4px;">
                        ${to12Hour(t)}
                        <button data-type="notification" data-index="${i}" style="margin-left:6px;font-size:12px;background:none;border:none;color:#ff6b6b;cursor:pointer;">✖</button>
                    </span>`
                ).join("")
                : "<span style='color:#aaa;'>None</span>";
        }
        renderTimes();

        // Add manual notification time
        modal.querySelector('#add-notification-time').onclick = function () {
            const input = modal.querySelector('#manual-time-input');
            if (input.value && /^\d{2}:\d{2}$/.test(input.value.trim())) {
                let times = getNotificationTimes();
                if (!times.includes(input.value.trim())) {
                    times.push(input.value.trim());
                    setNotificationTimes(times);
                    updatePrayerIconTooltip();
                    renderTimes();
                    input.value = "";
                    if (isReallyTornPDA && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                        const parsed = parseTimeString(input.value.trim());
                        console.log('Parsed time:', parsed);
                        if (parsed) {
                            schedulePrayerReminder(parsed.hour, parsed.minute);
                        } else {
                            alert('Invalid time format. Please use HH:MM or HH:MM AM/PM.');
                        }
                    }
                }
            }
        };

        // Remove manual notification time
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

        // Interval toggle
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

        // Snooze toggle (updates snooze display and button instantly)
        modal.querySelector('#toggle-snooze-btn').onclick = function () {
            let settings = getIntervalSettings();
            if (settings.snoozedUntil) {
                // Unset snooze
                settings.snoozedUntil = null;
            } else {
                // Set snooze until next interval start
                const now = new Date();
                const [h, m] = settings.start.split(":").map(Number);
                let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
                if (now >= next) next.setDate(next.getDate() + 1);
                settings.snoozedUntil = next.toISOString();
            }
            setIntervalSettings(settings);

            // Reload settings from storage to get the latest value
            const updatedSettings = getIntervalSettings();
            function snoozeText() {
                if (!updatedSettings.snoozedUntil) return "None";
                const d = new Date(updatedSettings.snoozedUntil);
                return d.toLocaleString();
            }
            modal.querySelector('#current-snooze').textContent = snoozeText();
            modal.querySelector('#toggle-snooze-btn').textContent = updatedSettings.snoozedUntil ? "Unset Snooze" : "Snooze Until Next Interval";
            updatePrayerIconTooltip();
            setTimeout(updatePrayerIconTooltip, 100); // Extra update for mobile/PDA
        };

        // Cancel button (just closes modal)
        modal.querySelector('#cancel-prayer-modal').onclick = function () {
            modal.remove();
        };

        // Icon position and Save/refresh
        modal.querySelector('#close-prayer-modal').onclick = function () {
            const iconPosition = modal.querySelector('input[name="icon-position"]:checked').value;
            const iconOffset = parseInt(modal.querySelector('#icon-offset').value, 10);

            // Save icon position settings to localStorage
            localStorage.setItem('prayerReminderIconSettings', JSON.stringify({
                position: iconPosition,
                offset: iconOffset
            }));

            // Refresh page using correct handler
            if (isReallyTornPDA && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                window.flutter_inappwebview.callHandler('reloadPage');
            } else {
                window.location.reload();
            }
        };

        // Icon position radio change handler to enable/disable offset input
        const iconOffsetInput = modal.querySelector('#icon-offset');
        const iconPositionRadios = modal.querySelectorAll('input[name="icon-position"]');

        // Helper to update disabled style
        function updateOffsetDisabledStyle() {
            if (iconOffsetInput.disabled) {
                iconOffsetInput.style.background = "#333";
                iconOffsetInput.style.opacity = "0.5";
                iconOffsetInput.style.cursor = "not-allowed";
            } else {
                iconOffsetInput.style.background = "#181818";
                iconOffsetInput.style.opacity = "1";
                iconOffsetInput.style.cursor = "";
            }
        }
        updateOffsetDisabledStyle();

        iconPositionRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                if (this.value === "beginning") {
                    iconOffsetInput.disabled = true;
                } else {
                    iconOffsetInput.disabled = false;
                }
                updateOffsetDisabledStyle();
                // Save instantly
                localStorage.setItem('prayerReminderIconSettings', JSON.stringify({
                    position: this.value,
                    offset: parseInt(iconOffsetInput.value, 10)
                }));
            });
        });
        iconOffsetInput.addEventListener('input', function () {
            const selectedPosition = modal.querySelector('input[name="icon-position"]:checked').value;
            localStorage.setItem('prayerReminderIconSettings', JSON.stringify({
                position: selectedPosition,
                offset: parseInt(iconOffsetInput.value, 10)
            }));
        });

        // Create the button
        const logBtn = document.createElement('button');
        logBtn.textContent = 'Log Scheduled Notifications';
        logBtn.style.marginLeft = '10px';
        logBtn.onclick = async function() {
            if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                try {
                    const scheduled = await window.flutter_inappwebview.callHandler('getScheduledNotifications');
                    console.log('[Prayer Reminder] Scheduled notifications:', scheduled);
                    if (Array.isArray(scheduled)) {
                        scheduled.forEach(n => {
                            const localTime = new Date(n.timestamp).toLocaleString();
                            console.log(`ID: ${n.id}, Time: ${localTime}, Title: ${n.title}`);
                        });
                    }
                } catch (e) {
                    console.error('[Prayer Reminder] Failed to fetch scheduled notifications:', e);
                }
            } else {
                console.warn('Not running in Torn PDA environment.');
            }
        };

        // Add the button to your modal (adjust selector as needed)
        modal.appendChild(logBtn); // Replace modalElement with your modal's container variable
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

    // --- Main Scheduling Logic ---
    async function schedulePrayerReminder(hour, minute) {
        if (
            typeof hour !== 'number' ||
            typeof minute !== 'number' ||
            isNaN(hour) ||
            isNaN(minute) ||
            hour < 0 || hour > 23 ||
            minute < 0 || minute > 59
        ) {
            console.error(`[Prayer] Invalid hour or minute: hour=${hour}, minute=${minute}`);
            return;
        }

        const now = new Date();
        const targetTime = new Date(now);
        targetTime.setHours(hour, minute, 0, 0);

        if (isNaN(targetTime.getTime())) {
            console.error(`[Prayer] Computed invalid targetTime for hour=${hour}, minute=${minute}`);
            return;
        }

        if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
        }

        const targetTimestamp = targetTime.getTime();

        let existing = [];
        try {
            existing = await window.flutter_inappwebview.callHandler('getScheduledNotifications');
        } catch (e) {
            console.warn('[Prayer] Could not fetch scheduled notifications:', e);
        }

        const alreadyScheduled = (existing || []).some(n => {
            return Math.abs(n.timestamp - targetTimestamp) < 1000;
        });

        if (alreadyScheduled) {
            console.log(`[Prayer] Notification already scheduled for ${targetTime.toLocaleString()}`);
            return;
        }

        const existingIds = new Set((existing || []).map(n => n.id));
        let id;
        let attempts = 0;
        do {
            id = Math.floor(Math.random() * 9999) + 1;
            attempts++;
            if (attempts > 10000) {
                console.error('Unable to find free notification ID');
                return;
            }
        } while (existingIds.has(id));

        window.flutter_inappwebview.callHandler('scheduleNotification', {
            title: 'Time to pray ' + emoji,
            subtitle: `Scheduled at ${targetTime.toLocaleTimeString()}`,
            id: id,
            timestamp: targetTimestamp,
            overwriteID: false,
            launchNativeToast: true,
            toastMessage: `Prayer reminder set for ${targetTime.toLocaleTimeString()}`,
            toastColor: 'green',
            toastDurationSeconds: 4,
            urlCallback: churchUrl
        });

        console.log(`[Prayer] Scheduled new notification ID ${id} for ${targetTime.toLocaleString()}`);
    }

    function scheduleAllPrayerReminders() {
        const times = getNotificationTimes();
        times.forEach(t => {
            const [h, m] = t.split(":").map(Number);
            schedulePrayerReminder(h, m);
        });
    }

    // --- Torn PDA check and kickoff ---
    window.addEventListener('load', () => {
        detectTornPDA(() => {
            if (isReallyTornPDA && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                console.log('[Prayer Reminder] Detected Torn PDA. Scheduling notifications...');
                scheduleAllPrayerReminders();
            }
        });
    });

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