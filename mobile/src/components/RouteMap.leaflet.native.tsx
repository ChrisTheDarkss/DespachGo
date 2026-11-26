import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import type { RouteMapProps } from "@/src/components/RouteMap.types";
import {
  isGpsLocationFixFresh,
  isValidGpsLocationFix,
} from "@/src/services/gpsStore";

type LeafletRouteMapProps = RouteMapProps & {
  onLoadError: () => void;
};

const leafletCssUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJsUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const routeColors = ["#2563EB", "#F97316", "#9333EA", "#0D9488"];

function escapeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function RouteMap({
  points,
  drivingRoute,
  currentLocation = null,
  gpsTrackingActive = false,
  compact = false,
  onInteractionChange,
  onLoadError,
}: LeafletRouteMapProps) {
  const webViewRef = useRef<WebView<{}>>(null);
  const webViewReady = useRef(false);
  const routeNeedsInitialFit = useRef(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const syncDriverMarker = useCallback(() => {
    if (!webViewReady.current) {
      return;
    }

    if (
      !gpsTrackingActive ||
      !isValidGpsLocationFix(currentLocation) ||
      currentLocation.timestamp > Date.now()
    ) {
      webViewRef.current?.injectJavaScript(
        "if (window.clearDriverLocation) window.clearDriverLocation(); true;",
      );
      return;
    }

    const { latitude, longitude, timestamp } = currentLocation;
    const isRecent = isGpsLocationFixFresh(currentLocation, now);
    webViewRef.current?.injectJavaScript(
      `if (window.updateDriverLocation) window.updateDriverLocation(${latitude}, ${longitude}, ${timestamp}, ${isRecent}); true;`,
    );
  }, [currentLocation, gpsTrackingActive, now]);

  const syncRouteSegments = useCallback(() => {
    if (!webViewReady.current) {
      return;
    }

    const segments =
      drivingRoute?.legs.map(({ segmentIndex, coordinates }) => ({
        segmentIndex,
        coordinates,
      })) ?? [];
    const fitBounds = routeNeedsInitialFit.current && segments.length > 0;
    webViewRef.current?.injectJavaScript(
      `if (window.updateRouteSegments) window.updateRouteSegments(${escapeForScript(segments)}, ${fitBounds}); true;`,
    );
    if (segments.length > 0) {
      routeNeedsInitialFit.current = false;
    }
  }, [drivingRoute]);

  useEffect(() => {
    syncDriverMarker();
  }, [syncDriverMarker]);

  useEffect(() => {
    syncRouteSegments();
  }, [syncRouteSegments]);

  const handleLoadEnd = useCallback(() => {
    webViewReady.current = true;
    syncDriverMarker();
    syncRouteSegments();
  }, [syncDriverMarker, syncRouteSegments]);

  const centerOnDriver = useCallback(async () => {
    if (!gpsTrackingActive) {
      Alert.alert(
        "Seguimiento GPS inactivo",
        "Verifica los permisos de ubicación e inicia el seguimiento de la ruta para usar Mi ubicación.",
      );
      return;
    }

    try {
      const location =
        isValidGpsLocationFix(currentLocation) &&
        currentLocation.timestamp <= Date.now()
          ? currentLocation
          : null;
      const isRecent = Boolean(isGpsLocationFixFresh(location));
      if (location) {
        const { latitude, longitude, timestamp } = location;
        webViewRef.current?.injectJavaScript(
          `if (window.updateDriverLocation) window.updateDriverLocation(${latitude}, ${longitude}, ${timestamp}, ${isRecent}); if (window.centerOnDriver) window.centerOnDriver(); true;`,
        );
      }

      const foregroundPermission =
        await Location.getForegroundPermissionsAsync();
      if (!foregroundPermission.granted) {
        Alert.alert(
          "Permiso de ubicación requerido",
          location
            ? "Se centró en la última ubicación conocida, pero falta permiso de ubicación para recibir nuevas posiciones."
            : "Concede a DespachGo permiso de ubicación. Aún no hay una posición válida para centrar.",
        );
        return;
      }

      const backgroundPermission =
        await Location.getBackgroundPermissionsAsync();
      if (!backgroundPermission.granted) {
        Alert.alert(
          "Permiso de ubicación requerido",
          location
            ? "Se centró en la última ubicación conocida, pero falta permiso en segundo plano para mantener actualizado el seguimiento."
            : "Concede permiso de ubicación en segundo plano. Aún no hay una posición válida para centrar.",
        );
        return;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert(
          "GPS desactivado",
          location
            ? "Se centró en la última ubicación conocida. Activa el GPS para recibir una posición actualizada."
            : "Activa la ubicación del dispositivo. Aún no hay una posición válida para centrar.",
        );
        return;
      }

      if (!location) {
        Alert.alert(
          "Ubicación no disponible",
          "Aún no hay una posición GPS válida. Espera una actualización del seguimiento y vuelve a intentarlo.",
        );
        return;
      }

      if (!isRecent) {
        Alert.alert(
          "Última ubicación conocida",
          `El mapa se centró en la ubicación actualizada ${new Date(location.timestamp).toLocaleTimeString()}.`,
        );
      }
    } catch {
      Alert.alert(
        "No se pudo comprobar el GPS",
        "Verifica los permisos de ubicación y el estado del GPS del dispositivo.",
      );
    }
  }, [currentLocation, gpsTrackingActive]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      if (event.nativeEvent.data === "leaflet-load-error") {
        onLoadError();
      } else if (event.nativeEvent.data === "center-on-driver") {
        void centerOnDriver();
      } else if (event.nativeEvent.data === "map-touch-start") {
        onInteractionChange?.(true);
      } else if (event.nativeEvent.data === "map-touch-end") {
        onInteractionChange?.(false);
      }
    },
    [centerOnDriver, onInteractionChange, onLoadError],
  );

  const html = useMemo(() => {
    const mapData = escapeForScript({
      points: points.map(({ number, latitud, longitud }) => ({
        number,
        latitud,
        longitud,
      })),
    });

    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <link rel="stylesheet" href="${leafletCssUrl}">
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; background: #f5f7f5; }
      .stop-marker {
        align-items: center; background: #176447; border: 2px solid #fff;
        border-radius: 50%; box-shadow: 0 1px 5px rgba(0,0,0,.35);
        color: #fff; display: flex; font: 700 14px sans-serif;
        height: 36px; justify-content: center; width: 36px;
      }
      .leaflet-control-attribution { font-size: 10px; }
      .driver-location-control {
        background: #fff; border: 1px solid #9aa79f; border-radius: 6px;
        color: #20342a; font: 600 13px sans-serif; min-height: 40px;
        padding: 0 10px;
      }
      .driver-location-control.following {
        background: #0891b2; border-color: #0891b2; color: #fff;
      }
    </style>
    <script>
      function reportMapError() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage("leaflet-load-error");
        }
      }
    </script>
    <script src="${leafletJsUrl}" onerror="reportMapError()"></script>
  </head>
  <body>
    <div id="map"></div>
    <script>
      try {
        if (!window.L) {
          reportMapError();
        } else {
          const data = ${mapData};
          const map = L.map("map", { zoomControl: true });

          // Avisa a la app cuando el dedo toca el mapa para que la pantalla
          // no se desplace mientras se arrastra (evita que el mapa "se vaya").
          const mapElement = document.getElementById("map");
          const notifyTouch = (active) => {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(
                active ? "map-touch-start" : "map-touch-end"
              );
            }
          };
          mapElement.addEventListener("touchstart", () => notifyTouch(true), { passive: true });
          ["touchend", "touchcancel"].forEach((type) => {
            mapElement.addEventListener(type, (event) => {
              if (!event.touches || event.touches.length === 0) {
                notifyTouch(false);
              }
            }, { passive: true });
          });
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
          }).addTo(map);

          let driverMarker = null;
          let driverAnimationFrame = null;
          let lastDriverFixAt = 0;
          let followDriver = false;
          let locateButton = null;
          let routeLayers = [];

          function setFollowDriver(value) {
            followDriver = value;
            if (locateButton) {
              locateButton.classList.toggle("following", value);
              locateButton.textContent = value ? "Siguiendo" : "Mi ubicación";
            }
          }
          // Mantiene el marcador en el centro del mapa sin recalcular las capas.
          function keepDriverCentered(latLng) {
            const offset = map
              .latLngToContainerPoint(latLng)
              .subtract(map.getSize().divideBy(2));
            if (Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5) {
              map.panBy(offset, { animate: false });
            }
          }
          // El mapa deja de seguir al conductor si el usuario lo arrastra.
          map.on("dragstart", function() { setFollowDriver(false); });

          window.updateDriverLocation = function(latitude, longitude, timestamp, isRecent) {
            const target = L.latLng(latitude, longitude);
            const arrivedAt = performance.now();
            if (!driverMarker) {
              driverMarker = L.circleMarker(target, {
                radius: 9,
                color: "#ffffff",
                weight: 3,
                fillColor: isRecent ? "#0891b2" : "#64748b",
                fillOpacity: 1
              }).addTo(map);
              driverMarker.bindTooltip("");
              if (followDriver) { keepDriverCentered(target); }
            } else {
              driverMarker.setStyle({
                fillColor: isRecent ? "#0891b2" : "#64748b"
              });
              // Se parte desde donde está dibujado el marcador ahora mismo.
              const from = driverMarker.getLatLng();
              const jumpMeters = from.distanceTo(target);
              if (jumpMeters >= 0.5) {
                if (driverAnimationFrame) {
                  cancelAnimationFrame(driverAnimationFrame);
                  driverAnimationFrame = null;
                }
                if (jumpMeters > 500) {
                  // Salto grande (p. ej. al volver del segundo plano): sin animar.
                  driverMarker.setLatLng(target);
                  if (followDriver) { keepDriverCentered(target); }
                } else {
                  // Movimiento continuo y lineal: el marcador llega al nuevo punto
                  // justo cuando se espera la siguiente lectura del GPS.
                  const sinceLastFix = lastDriverFixAt ? arrivedAt - lastDriverFixAt : 1000;
                  const duration = Math.min(Math.max(sinceLastFix, 300), 1500);
                  const animateMarker = function(frameTime) {
                    const progress = Math.min((frameTime - arrivedAt) / duration, 1);
                    const next = L.latLng(
                      from.lat + (target.lat - from.lat) * progress,
                      from.lng + (target.lng - from.lng) * progress
                    );
                    driverMarker.setLatLng(next);
                    if (followDriver) { keepDriverCentered(next); }
                    if (progress < 1) {
                      driverAnimationFrame = requestAnimationFrame(animateMarker);
                    } else {
                      driverAnimationFrame = null;
                    }
                  };
                  driverAnimationFrame = requestAnimationFrame(animateMarker);
                }
              }
            }
            lastDriverFixAt = arrivedAt;
            driverMarker.setTooltipContent(
              (isRecent ? "Ubicación reciente" : "Última ubicación conocida") +
              " · Actualizada " + new Date(timestamp).toLocaleTimeString()
            );
          };
          window.updateRouteSegments = function(segments, fitBounds) {
            routeLayers.forEach((layer) => map.removeLayer(layer));
            routeLayers = [];
            const bounds = data.points.map((point) => [point.latitud, point.longitud]);
            segments.forEach(({ coordinates, segmentIndex }) => {
              if (coordinates.length < 2) {
                return;
              }
              const latLngs = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
              const routeLayer = L.polyline(latLngs, {
                color: ${JSON.stringify(routeColors)}[segmentIndex % ${routeColors.length}],
                weight: 5,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round"
              }).addTo(map);
              routeLayers.push(routeLayer);
              latLngs.forEach((position) => bounds.push(position));
            });
            if (fitBounds && bounds.length === 1) {
              map.setView(bounds[0], 14);
            } else if (fitBounds && bounds.length > 1) {
              map.fitBounds(L.latLngBounds(bounds).pad(0.12), { maxZoom: 16 });
            }
          };
          window.clearDriverLocation = function() {
            if (driverAnimationFrame) {
              cancelAnimationFrame(driverAnimationFrame);
              driverAnimationFrame = null;
            }
            if (driverMarker) {
              map.removeLayer(driverMarker);
              driverMarker = null;
            }
            lastDriverFixAt = 0;
            setFollowDriver(false);
          };
          // "Mi ubicación" centra el mapa y lo deja siguiendo al conductor
          // mientras se mueve; arrastrar el mapa desactiva el seguimiento.
          window.centerOnDriver = function() {
            if (driverMarker) {
              setFollowDriver(true);
              map.setView(
                driverMarker.getLatLng(),
                Math.max(map.getZoom(), 16),
                { animate: false }
              );
            }
          };

          const locateControl = L.control({ position: "bottomright" });
          locateControl.onAdd = function() {
            const button = L.DomUtil.create("button", "driver-location-control");
            button.type = "button";
            button.textContent = "Mi ubicación";
            locateButton = button;
            button.setAttribute("aria-label", "Centrar mapa en mi ubicación GPS");
            L.DomEvent.disableClickPropagation(button);
            L.DomEvent.on(button, "click", function(event) {
              L.DomEvent.preventDefault(event);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage("center-on-driver");
              }
            });
            return button;
          };
          locateControl.addTo(map);

          const bounds = [];
          data.points.forEach((point) => {
            const position = [point.latitud, point.longitud];
            bounds.push(position);
            const icon = L.divIcon({
              className: "",
              html: '<div class="stop-marker">' + point.number + '</div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            });
            L.marker(position, { icon }).addTo(map);
          });

          if (bounds.length === 1) {
            map.setView(bounds[0], 14);
          } else if (bounds.length > 1) {
            map.fitBounds(L.latLngBounds(bounds).pad(0.12), { maxZoom: 16 });
          } else {
            map.setView([-33.4489, -70.6693], 12);
          }
        }
      } catch {
        reportMapError();
      }
    </script>
  </body>
</html>`;
  }, [points]);
  const source = useMemo(
    () => ({ html, baseUrl: "https://localhost" }),
    [html],
  );

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <WebView
        domStorageEnabled
        javaScriptEnabled
        onLoadEnd={handleLoadEnd}
        onLoadStart={() => {
          webViewReady.current = false;
          routeNeedsInitialFit.current = true;
        }}
        onError={onLoadError}
        onHttpError={onLoadError}
        onMessage={handleMessage}
        originWhitelist={["*"]}
        ref={webViewRef}
        nestedScrollEnabled
        overScrollMode="never"
        scrollEnabled={false}
        source={source}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    flex: 1,
    minHeight: 420,
    overflow: "hidden",
  },
  compactContainer: {
    flex: 0,
    height: 230,
    minHeight: 230,
  },
  webView: {
    backgroundColor: "#f5f7f5",
    flex: 1,
  },
});
