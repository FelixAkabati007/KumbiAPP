import { GET as getOrders, POST as createOrder } from "@/app/api/orders/route";
import { withApiVersion } from "@/lib/api-version";

export async function GET() {
  return withApiVersion(await getOrders());
}

export async function POST(request: Request) {
  return withApiVersion(await createOrder(request));
}
