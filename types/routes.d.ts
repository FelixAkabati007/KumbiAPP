import type { NextRouter } from "next/router";

declare module ".next/types/routes" {
  type RouteType = keyof NextRouter["routes"];

  export interface Routes {
    [key: string]: RouteType;
  }
}
