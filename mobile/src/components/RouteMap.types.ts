import type { DrivingRoute, RoutingPoint } from "@/src/services/driverRouting";

export type RouteMapProps = {
  points: RoutingPoint[];
  drivingRoute: DrivingRoute | null;
};
