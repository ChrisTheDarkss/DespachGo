import type { DrivingRoute, RoutingPoint } from "@/src/services/driverRouting";
import type { GpsLocationFix } from "@/src/services/gpsStore";

export type RouteMapProps = {
  points: RoutingPoint[];
  drivingRoute: DrivingRoute | null;
  currentLocation?: GpsLocationFix | null;
  gpsTrackingActive?: boolean;
  compact?: boolean;
};
