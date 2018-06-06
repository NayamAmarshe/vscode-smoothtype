let vscode = require("vscode");
let fs = require("fs");
let path = require("path");
let events = require("events");
let msg = require("./messages").messages;

function activate(context) {
    process.on("uncaughtException", (error) => {
        if (/ENOENT|EACCES|EPERM/.test(error.code)) {
            vscode.window.showInformationMessage(msg.needAdministrator);
            return;
        }
    });

    let eventEmitter = new events.EventEmitter();
    let isWindows = /^win/.test(process.platform);
    let appDirectory = path.dirname(require.main.filename);

    let base = appDirectory + (isWindows ? "\\vs\\workbench" : "/vs/workbench");

    let htmlFile = base + (isWindows ? "\\electron-browser\\bootstrap\\index.html" : "/electron-browser/bootstrap/index.html");
    let htmlFileBackup = base + (isWindows ? "\\electron-browser\\bootstrap\\index.html.bak-smoothtype" : "/electron-browser/bootstrap/index.bak-smoothtype");

    function replaceCSS() {
        let config = vscode.workspace.getConfiguration("smoothtype");

        console.log(config);

        if (!config || !config.duration) {
            vscode.window.showInformationMessage(msg.notConfigured);
            console.log(msg.notConfigured);
            disableAnimation();
            return;
        }

        let injectHTML = "<style> .cursor { transition: all " + config.duration + "ms; } </style>";

        try {
            let html = fs.readFileSync(htmlFile, "utf-8");

            html = html.replace(/<!-- !! SmoothType CSS Start !! -->[\s\S]*?<!-- !! SmoothType CSS End !! -->/, "");

            if (config.policy) {
                html = html.replace(/<meta.*http-equiv="Content-Security-Policy".*>/, "");
            }

            html = html.replace(/(<\/html>)/,
                "<!-- !! SmoothType CSS Start !! -->" + injectHTML + "<!-- !! SmoothType CSS End !! --></html>");
            fs.writeFileSync(htmlFile, html, "utf-8");
            enabledRestart();
        } catch (e) {
            console.log(e);
        }
    }

    function getTimeDiff(d1, d2) {
        let timeDiff = Math.abs(d2.getTime() - d1.getTime());
        return timeDiff;
    }

    function hasBeenUpdated(stats1, stats2) {
        let dbak = new Date(stats1.ctime);
        let dor = new Date(stats2.ctime);
        let segs = getTimeDiff(dbak, dor) / 1000;
        return segs > 60;
    }

    function injectCSS() {
        let c = fs.createReadStream(htmlFile).pipe(fs.createWriteStream(htmlFileBackup));
        c.on("finish", replaceCSS);
    }

    function installItem(backupFile, originalFile, installer) {
        fs.stat(backupFile, (errBak, backupStats) => {
            if (errBak) {
                // clean installation
                installer();
            } else {
                // check htmlFileBack"s timestamp and compare it to the htmlFile"s.
                fs.stat(originalFile, (error, originalStats) => {
                    if (error) vscode.window.showInformationMessage(msg.unknownError + error);
                    else {
                        let updated = hasBeenUpdated(backupStats, originalStats);
                        if (updated) installer();
                    }
                });
            }
        });
    }

    function emitEndUninstall() {
        eventEmitter.emit("endUninstall");
    }

    function restoredAction(restored, reinstall) {
        if (restored >= 1) {
            if (reinstall) emitEndUninstall();
            else disabledRestart();
        }
    }

    function restoreBackup(reinstall) {
        let restore = 0;

        fs.unlink(htmlFile, (err) => {
            if (err) {
                vscode.window.showInformationMessage(msg.needAdministrator);
                return;
            }

            let writer = fs.createReadStream(htmlFileBackup).pipe(fs.createWriteStream(htmlFile));

            writer.on("finish", () => {
                fs.unlink(htmlFileBackup);
                restore++;
                restoredAction(restore, reinstall);
            });
        });
    }

    function reloadWindow() {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
    }

    function enabledRestart() {
        vscode.window.showInformationMessage(msg.enabled, { title: msg.restartIde }).then(reloadWindow);
    }
    function disabledRestart() {
        vscode.window.showInformationMessage(msg.disabled, { title: msg.restartIde }).then(reloadWindow);
    }

    function enableAnimation() {
        installItem(htmlFileBackup, htmlFile, injectCSS);
    }

    function disableAnimation(reinstall) {
        fs.stat(htmlFileBackup, (error) => {
            if (error) {
                if (reinstall) emitEndUninstall();
                return;
            }
            fs.stat(htmlFile, (error) => {
                if (error) vscode.window.showInformationMessage(msg.unknownError + error);
                else restoreBackup(reinstall);
            });
        });
    }

    function updateAnimation() {
        eventEmitter.once("endUninstall", enableAnimation);
        disableAnimation(true);
    }

    let installCustomCSS = vscode.commands.registerCommand("extension.enableAnimation", enableAnimation);
    let uninstallCustomCSS = vscode.commands.registerCommand("extension.disableAnimation", disableAnimation);
    let updateCustomCSS = vscode.commands.registerCommand("extension.reloadAnimation", updateAnimation);

    context.subscriptions.push(installCustomCSS);
    context.subscriptions.push(uninstallCustomCSS);
    context.subscriptions.push(updateCustomCSS);

    console.log("SmoothType is active!");
}

exports.activate = activate;

// this method is called when your extension is deactivated
exports.deactivate = () => vscode.commands.executeCommand("extension.disableAnimation");
