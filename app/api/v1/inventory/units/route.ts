import { GET as getUnits } from "@/app/api/units/route";
import { withApiVersion } from "@/lib/api-version";

export async function GET() {
  return withApiVersion(await getUnits());
}
