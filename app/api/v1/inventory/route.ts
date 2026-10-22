import { GET as getInventory, POST as createInventory } from "@/app/api/inventory/route";
import { withApiVersion } from "@/lib/api-version";

export async function GET() {
  return withApiVersion(await getInventory());
}

export async function POST(request: Request) {
  return withApiVersion(await createInventory(request));
}
