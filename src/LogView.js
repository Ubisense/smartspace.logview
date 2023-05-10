import { HubConnectionBuilder } from '@microsoft/signalr';

class LogView {
    constructor(anonOrAddress) {
        if (typeof anonOrAddress == "boolean") {
            this.url = anonOrAddress ? '/SmartSpace/LogViewAnon' : '/SmartSpace/LogView';
        }
        else {
            if (anonOrAddress) this.url = anonOrAddress;
            else this.url = '/SmartSpace/LogView';
        }

        this.registrations = [];
        this.errorCallback = function () { };

        this.connection = new HubConnectionBuilder()
            .withUrl(this.url)
            .build();
        this.connection.onclose(() => {
            this.errorCallback('reconnecting');
            this.reconnect();
        });

        // Create a private log handler callback.
        let lv = this;        
        this.connection.on('log', (data) => {
            // Convert the date to local javascript.
            data.when = new Date(data.when);
            
            if (typeof lv.target == "function") lv.target(data);
            else {
                if (lv.property) {
                    lv.target[lv.property] = data;
                } else {
                    lv.target = data;
                }
            }
        });
    }

    async start() {
        try {
            await this.connection.start();
            delete this.backoffMs;
            this.errorCallback();
        } catch (err) {
            this.errorCallback('failed', err);
            this.reconnect();
        }
    }

    async stop() {
        await this.connection.stop();
    }

    // Each log line is an object containing fields "when", "source", "logObject" and "message".
    // If target is a function, this is called with the log line object.
    // Otherwise, if property is undefined, target is set to the value of each log line object.
    // Otherwise, target[property] is set to the value of each log line object.
    setTarget(target, property) {
        this.target = target;
        this.targetProperty = property;
    }

    onError(cb) {
        this.errorCallback = cb;
    }

   

    async requestLog(source, filter, logObject, options) {
        var params = { Source: source ?? 'SmartSpace', Filter: filter ?? '', Object: logObject ?? '', Options: options ?? '' };
        this.registrations.push(params);

        return this.connection.invoke('Register', params);
    }

    async clearLogs() {
        this.registrations = [];
        return this.connection.invoke('Deregister');
    }

    async logMessage(v, stream) {
        await this.connection.invoke('SendLog', stream ?? 'log_view', v);
    }

    async reconnect() {
        // Compute an increasing backoff.
        const maxBackoffMs = 16000;
        
        const backoff = this.backoffMs ?? 500;
        this.backoffMs = Math.min(backoff*2, maxBackoffMs);

        // Add dither.
        let timeout = backoff + Math.floor(Math.random() * 100);
        try {
            this.errorCallback(`reconnecting`);
            await new Promise(resolve => setTimeout(resolve, timeout));
            return this.start().then(() => {
                for (const ps of this.registrations) {
                    this.connection.invoke('Register', ps);
                }
            }
            );
        } catch (err) {
            //this.errorCallback(`Failed to reconnect to SignalR hub: ${err}`);
        }
    }
}

export default LogView;
