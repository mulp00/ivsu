let UUID = "bd9bf59d-8cf7-4db5-9c1f-6ae4379d3cbf" //Globalní UUID
//let counter = 0;
let locationDelay = new Date(1950).getTime();
let latestLocation = {lat: null, lon: null, address: null, time: null};
let que = [];

let ref = null; //inappbrowser okno

let app = {
        initialize: function () {

            this.bindEvents();
        },
        bindEvents: function () {
            document.addEventListener('deviceready', app.onDeviceReady, false);

        },
        onDeviceReady: function () {


            //document.addEventListener("offline", app.goOffline, false);
            //document.addEventListener("online", app.goOnline, false);
            app.goOnline();




        },
        goOffline: function () {
            console.log("fire");
            window.location = "index.html";
            app.onDeviceReady();
        },
        goOnline: function () {

            cordova.plugins.foregroundService.start(
                'Sticker Scanning', 'ivsu', 'icon');//Spuštění foreground Service

            cordova.plugins.backgroundMode.enable();//Aktivace background mode
            cordova.plugins.backgroundMode.disableWebViewOptimizations();
            cordova.plugins.backgroundMode.setDefaults({
                title: 'IVSU running',
                text: 'click to open',
                icon: 'icon',
                color: "275efe",
                resume: true,
                hidden: true,
                bigText: true
            });

            ref = cordova.InAppBrowser.open(
                'https://ivsu.cz',
                '_self',
                'location=no,hideurlbar=yes,hidenavigationbuttons=no,fullscreen=no, zoom=no');
            ref.addEventListener('loadstop', function () {
                ref.executeScript(
                    {code: "window.isCordova = true;"}); //Webová aplikace je informována o hybridním režimu
            });

            app.refreshDeviceList() //spustime hned
            setInterval(function () {
                app.refreshDeviceList()
            }, 8000);
        },
        refreshDeviceList: function () {
            ref.executeScript({code: "window.beaconsArr = []; beaconHandler();"});//TODO updateBeaconsList();
            window.plugins.mockgpschecker.check(app.mockLocSuccessCallback, app.mockLocErrorCallback);

        },
        mockLocSuccessCallback: function (isNotMocked) {
            if (isNotMocked) {
                // scan for all devices
                ble.scan([UUID], 5, app.onDiscoverDevice, app.onScanError);
            } else {
                navigator.notification.alert("Your location is being mocked!");

            }
        },
        mockLocErrorCallback: function () {
            navigator.notification.alert("Can't check location mocking");
        },
        onDiscoverDevice: function (device) {
            let id_beacon;

            //counter++; //TODO smazat, jen pro debagovaci ucely

            //pri zjisteni beaconu aktualizace polohy pokud je starsi nez 30s
            if (new Date().getTime() - locationDelay > 30000) {
                navigator.geolocation.getCurrentPosition
                (
                    app.onGeolocationSuccess,
                    app.onGeolocationError
                );
                locationDelay = new Date().getTime();
            }

            //formatovani ID beaconu
            let adData = new Uint8Array(device.advertising)
            id_beacon = app.toHexString(new Uint8Array(app.parseAdvertisingData(adData)["0x21"])).replace(app.toHexString(new Uint8Array(app.parseAdvertisingData(adData)["0x07"])), '');

            //pridani beaconu do seznamu na UI
            /*let listItem =
                '<li><b>' +
                device.name +
                '</b><br/>' +
                'RSSI: ' +
                device.rssi +
                '&nbsp;|&nbsp;' +
                id_beacon +
                '<br>' +
                new Date().toLocaleString() +
                '</li>';*/


            ref.executeScript({code:
                    "window.beaconsArr.push(['"
                    +device.name
                    +"','"
                    +device.rssi
                    +"','"
                    +id_beacon
                    +"','"
                    +new Date().toLocaleString()
                    +"']); "});//TODO updateBeaconsList();
            ref.executeScript({code:
                    "window.beaconsArr.push(['DLG-noTest','"
                    +device.rssi
                    +"','12345678901bae3d23b728ce93','"
                    +new Date().toLocaleString()
                    +"']); "});//TODO updateBeaconsList();
            ref.executeScript({code: "beaconHandler();"})
            console.log("takco");

            //existuje lokace a neni starsi nez 30s
            if (
                ((latestLocation.time != null) && (new Date().getTime() - latestLocation.time.getTime()) <= 30000) && latestLocation.address != null) {
                console.log("LOGING");
                app.pushLocationToDB(id_beacon);
            } else {//neexistuje lokace nebo je starsi nez 30s

                let hasMatch = false;
                let matchIndex = 0;

                //kontroluje jestli uz neni beacon ve fronte, pokud ano sebere jeho index
                for (let i = 0; i < Object.keys(que).length; ++i) {
                    if (que[i].id == id_beacon) {
                        hasMatch = true;
                        break;
                    }
                }
                //pokud je beacon ve fronte a nasel se index tak jen aktualizuje cas, jinak pushne do fronty novy zaznam
                if (hasMatch) {
                    que[matchIndex].time = (new Date());
                } else {
                    que.push({id: id_beacon, time: (new Date)});
                }
            }
        },
        onScanError:function (reason) {
                navigator.notification.alert("ERROR: " + reason); // real apps should use notification.alert
            },
        onGeolocationSuccess: function (position) {
            app.reverseGeocode(position.coords.latitude, position.coords.longitude).then(function (resolve) {
                latestLocation.lat = position.coords.latitude;
                latestLocation.lon = position.coords.longitude;

                //resolve je adresa ziskana reverse geocoding, ceka se na dokonceni async geocoding fce
                latestLocation.address = resolve;

                latestLocation.time = new Date();


                //existuje nova adresa...aktualizuj nevyreseny beacony
                let loopLen = Object.keys(que).length;
                for (let i = 0; i < loopLen; i++) {
                    let element = que.pop();
                    if ((latestLocation.time.getTime() - element.time.getTime()) <= 30000) {
                        app.pushLocationToDB(element.id);
                    } else {
                    }
                }

            }, function (reject) {
                navigator.notification.alert('error on reverse geocoding: '+reject);
            });
        },
        onGeolocationError: function (error) {
            navigator.notification.alert('code: ' + error.code + '\n' +
                'message: ' + error.message + '\n');
        },
        pushLocationToDB(id_beacon) {
            console.log("pushing");
            $.ajax({
                type: "POST",
                url: "https://ivsu.cz/beacon/beacon-update.php",
                crossDomain: true,
                data: {
                    id_beacon: id_beacon,
                    address: latestLocation.address,
                    lat: latestLocation.lat,
                    lon: latestLocation.lon
                }
            });
        },
        toHexString: function (byteArray) {
            return Array.prototype.map.call(byteArray, function (byte) {
                return ('0' + (byte & 0xFF).toString(16)).slice(-2);
            }).join('');
        },
        asHexString: function (i) {
            let hex;

            hex = i.toString(16);

            // zero padding
            if (hex.length === 1) {
                hex = "0" + hex;
            }

            return "0x" + hex;
        },
        parseAdvertisingData: function (buffer) {
            let length, type, data, i = 0, advertisementData = {};
            let bytes = new Uint8Array(buffer);

            while (length !== 0) {

                length = bytes[i] & 0xFF;
                i++;

                // decode type constants from https://www.bluetooth.org/en-us/specification/assigned-numbers/generic-access-profile
                type = bytes[i] & 0xFF;
                i++;

                data = bytes.slice(i, i + length - 1).buffer; // length includes type byte, but not length byte
                i += length - 2;  // move to end of data
                i++;

                advertisementData[app.asHexString(type)] = data;
            }

            return advertisementData;
        },
        reverseGeocode: function (latitude, longitude) {
            return new Promise(function (resolve, reject) {

                // set up the Geocoder object
                var geocoder = new google.maps.Geocoder();
                // turn coordinates into an object
                var yourLocation = new google.maps.LatLng(latitude, longitude);
                // find out info about our location
                geocoder.geocode({'latLng': yourLocation}, function (results, status) {

                    if (status == 'OK') {
                        if (results[0]) {
                            resolve(results[0].formatted_address);
                        } else {
                            reject();
                        }
                    } else {
                        reject();
                    }
                });
            });
        }
    };
app.initialize();





