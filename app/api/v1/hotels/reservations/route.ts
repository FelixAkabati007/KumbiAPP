import { GET as getReservations, POST as createReservation } from "@/app/api/hotels/reservations/route";
import { withApiVersion } from "@/lib/api-version";

export async function GET(request: Request) {
  return withApiVersion(await getReservations(request as never));
}

export async function POST(request: Request) {
  return withApiVersion(await createReservation(request as never));
}
