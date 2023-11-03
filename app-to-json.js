var prefix = window.location.pathname.substr(0, window.location.pathname.toLowerCase().lastIndexOf("/extensions") + 1);
var config = {
	host: window.location.hostname,
	prefix: prefix,
	port: window.location.port,
	isSecure: window.location.protocol === "https:"
};
require.config({
	baseUrl: (config.isSecure ? "https://" : "http://") + config.host + (config.port ? ":" + config.port : "") + config.prefix + "resources",
	paths: {
		qsocks: "/extensions/app-to-json/js/qsocks.bundle",
		serializeApp: '/extensions/app-to-json/js/serialize.bundle',
		dataTables: '/extensions/app-to-json/js/jquery.dataTables',
		'jszip': '/extensions/app-to-json/js/jszip'
	}
});

var main = {};

require(['js/qlik'], function (qlik) {
	require(['jquery', 'qsocks', 'jszip', 'serializeApp', 'dataTables'], function ($, qsocks, JSZip) {
		var getUrlParameter = function getUrlParameter(sParam) {

			var sPageURL = decodeURIComponent(window.location.search.substring(1)),
				sURLVariables = sPageURL.split('&'),
				sParameterName,
				i;

			for (i = 0; i < sURLVariables.length; i++) {
				sParameterName = sURLVariables[i].split('=');

				if (sParameterName[0] === sParam) {
					return sParameterName[1] === undefined ? true : sParameterName[1];
				}
			}
		};

		var ticket = getUrlParameter('qlikTicket');

		$('#backup').prop('disabled', true);
		$('#serialize').prop('disabled', true);
		$('#loadingImg').css('display', 'inline-block');

		const selectedAppNames = [];
		var checkedAppIds = [];

		var appConfig = {
			host: window.location.hostname,
			isSecure: window.location.protocol === "https:",
			appIds: [],
			port: window.location.port
		};

		var qSocksConnect = function () {
			if (checkedAppIds.length > 0) {
				appConfig.appIds.length = 0;
				appConfig.appIds.push(checkedAppIds);
			}

			if (ticket) {
				appConfig.ticket = ticket;
			}

			if (main.global) {
				main.global.connection.close();
				main = {};

				return qsocks.Connect(appConfig).then(function (global) {
					return main.global = global;
				})
			} else {
				return qsocks.Connect(appConfig).then(function (global) {
					return main.global = global;
				})
			}
		}

		function getVariables(app) {
			return app.createSessionObject({
				qVariableListDef: {
					qType: 'variable',
					qShowReserved: false,
					qShowConfig: false,
					qData: {
						info: '/qDimInfos'
					},
					qMeta: {}
				},
				qInfo: { qId: "VariableList", qType: "VariableList" }
			}).then(function (list) {
				return list.getLayout().then(function (layout) {
					return Promise.all(layout.qVariableList.qItems.map(function (d) {
						return app.getVariableById(d.qInfo.qId).then(function (variable) {
							return variable.getProperties().then(function (properties) { return properties; });
						});
					}));
				});
			});
		};

		//#region handle backup
		$("#backup").on("click", function () {
			$('#openDoc').css('visibility', 'hidden');
			$('#loadingImg').css('display', 'inline-block');

			try {
				main.global.connection.ws.close();
			} catch (ex) {
			}

			//#region convertToJSON
			async function convertToJSON(appName, zip) {
				return new Promise((resolve, reject) => {
					$('#loadingImg').css('display', 'inline-block');
					serializeAppBundle(main.app)
						.then(function (data) {
							data = JSON.stringify(data, null, 2);
							var fileName = appName + '.json';
							zip.file(fileName, data);
							resolve();
						})
						.catch(function (error) {
							reject(error);
						});
				});
			}
			//#endregion

			//#region processAppIds
			async function processAppIds() {
				const zip = new JSZip();
				for (const element of checkedAppIds) {
					try {
						await qSocksConnect();
						const app = await main.global.openDoc(element.appid);
						main.app = app;

						const appInfos = await main.app.getAllInfos();

						const connections = await main.app.getConnections();
						for (const connection of connections) {
							appInfos.qInfos.push({
								qId: connection.qId,
								qType: connection.qType
							});
						}

						const variables = await getVariables(main.app);
						for (const variable of variables) {
							appInfos.qInfos.push({
								qId: variable.qInfo.qId,
								qType: variable.qInfo.qType
							});
						}

						await convertToJSON(element.appname, zip);

						$('#json').prop('disabled', false);
						$('#loadingImg').css('display', 'none');
						$('#openDoc').css('visibility', 'visible');
						$('#serialize').prop('disabled', false);

						$('#openDoc').text("");
						selectedAppNames.forEach(function (appName, index) {
							$('#openDoc').append(appName);

							if (index < selectedAppNames.length - 1) {
								$('#openDoc').append(', ');
							}
						});
					} catch (error) {
						console.error("Error:", error);
					}
				}

				//#region download as zip
				zip.generateAsync({ type: "blob" }).then(function (content) {
					// Create a download link for the zip file
					const zipBlob = new Blob([content], { type: "application/zip" });
					const zipUrl = window.URL.createObjectURL(zipBlob);
					const a = document.createElement('a');
					a.style = "display: none";
					a.href = zipUrl;
					a.download = 'apps.zip';
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				});
				//#endregion
			}
			processAppIds();
			//#endregion

		});
		//#endregion

		//#region create table
		qSocksConnect().then(function () {
			return main.global.getDocList()
		}).then(function (docList) {
			for (var i = 0; i < docList.length; i++) {
				var table = document.getElementById("docList");

				var newRow = document.createElement("tr");

				// First <td> element with a checkbox
				var checkboxCell = document.createElement("td");
				var checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.setAttribute("appId", docList[i].qDocId);
				checkbox.setAttribute("appName", docList[i].qDocName)
				checkboxCell.appendChild(checkbox);
				newRow.appendChild(checkboxCell);

				// Second <td> element with appId and content
				var appNameCell = document.createElement("td");
				appNameCell.setAttribute("appId", docList[i].qDocId);
				appNameCell.textContent = docList[i].qDocName;
				newRow.appendChild(appNameCell);

				table.appendChild(newRow);
			}
			$('#loadingImg').css('display', 'none');
			$('#backup').prop('disabled', true);
		})
		//#endregion

		//#region handle checkbox
		$(document).ready(function () {
			$(document).on('change', 'input[type="checkbox"]', function () {
				var appid = $(this).attr('appid');
				var appname = $(this).attr('appname');

				if (this.checked) {
					checkedAppIds.push({ appid: appid, appname: appname });
				} else {
					var index = checkedAppIds.findIndex(function (app) {
						return app.appid === appid;
					});

					if (index !== -1) {
						checkedAppIds.splice(index, 1);
					}
				}
				if (checkedAppIds.length > 0)
				{
					$('#backup').prop('disabled', false);
				}
				else
				{
					$('#backup').prop('disabled', true);
				}
			});
		});
		//#endregion

	})
});