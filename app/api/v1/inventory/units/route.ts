import { GET as getUnits } from "@/app/api/units/route";

export async function GET() {
  return getUnits();
}
