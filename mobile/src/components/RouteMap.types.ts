import type { DrivingRoute, RoutingPoint } from "@/src/services/driverRouting";
import type { GpsLocationFix } from "@/src/services/gpsStore";

export type RouteMapProps = {
  points: RoutingPoint[];
  drivingRoute: DrivingRoute | null;
  currentLocation?: GpsLocationFix | null;
  gpsTrackingActive?: boolean;
  compact?: boolean;
  /**
   * Avisa cuando el dedo empieza/termina de tocar el mapa, para que la pantalla
   * que lo contiene deje de desplazarse mientras se arrastra el mapa.
   */
  onInteractionChange?: (active: boolean) => void;
};
