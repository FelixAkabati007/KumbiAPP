import type { UserRole } from "@/lib/roles";

export interface DefaultAccountSpec {
  id: string;
  email: string;
  aliases?: string[];
  name: string;
  role: UserRole;
  defaultPassword: string;
  acceptedPasswords: string[];
  department: string;
  position: string;
  jobClassification: string;
}

export const DEFAULT_ROLE_ACCOUNTS: readonly DefaultAccountSpec[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@kumbisaly.com",
    aliases: ["admin@example.com"],
    name: "System Administrator",
    role: "admin",
    defaultPassword: "Admin@123456!",
    acceptedPasswords: ["Admin@123456!", "Admin@123", "admin123"],
    department: "Operations",
    position: "Administrator",
    jobClassification: "operations",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "manager@kumbisaly.com",
    aliases: ["gm@kumbisaly.com"],
    name: "General Manager",
    role: "manager",
    defaultPassword: "Manager@123456!",
    acceptedPasswords: ["Manager@123456!", "Manager@123", "manager123"],
    department: "Operations",
    position: "General Manager",
    jobClassification: "operations",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "hotel.manager@kumbisaly.com",
    name: "Hotel Manager",
    role: "hotelManager",
    defaultPassword: "Hotel@123456!",
    acceptedPasswords: ["Hotel@123456!", "Hotel@123"],
    department: "Hotel",
    position: "Hotel Manager",
    jobClassification: "reception",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "restaurant.manager@kumbisaly.com",
    name: "Restaurant Manager",
    role: "restaurantManager",
    defaultPassword: "Restaurant@123456!",
    acceptedPasswords: ["Restaurant@123456!", "Restaurant@123"],
    department: "Restaurant",
    position: "Restaurant Manager",
    jobClassification: "restaurantPos",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    email: "finance@kumbisaly.com",
    name: "Finance Manager",
    role: "finance",
    defaultPassword: "Finance@123456!",
    acceptedPasswords: ["Finance@123456!", "Finance@123"],
    department: "Operations",
    position: "Finance Manager",
    jobClassification: "accountsFinance",
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    email: "operations@kumbisaly.com",
    name: "Operations Manager",
    role: "operationsManager",
    defaultPassword: "Operations@123456!",
    acceptedPasswords: ["Operations@123456!", "Operations@123"],
    department: "Operations",
    position: "Operations Manager",
    jobClassification: "operations",
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    email: "reception@kumbisaly.com",
    aliases: ["frontdesk@kumbisaly.com"],
    name: "Hotel Receptionist",
    role: "frontDesk",
    defaultPassword: "Reception@123456!",
    acceptedPasswords: ["Reception@123456!", "Reception@123"],
    department: "Hotel",
    position: "Receptionist",
    jobClassification: "reception",
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    email: "pos@kumbisaly.com",
    name: "Restaurant Front Desk",
    role: "restaurantFrontDesk",
    defaultPassword: "PosDesk@123456!",
    acceptedPasswords: ["PosDesk@123456!", "Pos@123456!", "Pos@123"],
    department: "Restaurant",
    position: "Restaurant Cashier",
    jobClassification: "restaurantPos",
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    email: "waiter@kumbisaly.com",
    name: "Service Waiter",
    role: "waiterWaitress",
    defaultPassword: "Waiter@123456!",
    acceptedPasswords: ["Waiter@123456!", "Waiter@123"],
    department: "Restaurant",
    position: "Waiter/Waitress",
    jobClassification: "waiterWaitress",
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    email: "chef@kumbisaly.com",
    aliases: ["kitchen@kumbisaly.com"],
    name: "Head Chef",
    role: "kitchen",
    defaultPassword: "Kitchen@123456!",
    acceptedPasswords: ["Kitchen@123456!", "Chef@123456!", "Kitchen@123"],
    department: "Restaurant",
    position: "Head Chef",
    jobClassification: "chef",
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    email: "housekeeping@kumbisaly.com",
    name: "Housekeeping Supervisor",
    role: "housekeeping",
    defaultPassword: "Housekeeping@123456!",
    acceptedPasswords: ["Housekeeping@123456!", "Housekeeping@123"],
    department: "Hotel",
    position: "Housekeeping",
    jobClassification: "housekeeping",
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    email: "staff@kumbisaly.com",
    name: "Service Staff",
    role: "staff",
    defaultPassword: "Staff@123456!",
    acceptedPasswords: ["Staff@123456!", "Staff@123"],
    department: "Restaurant",
    position: "Service Staff",
    jobClassification: "restaurantPos",
  },
];

export function findDefaultAccountByEmail(email: string | null | undefined): DefaultAccountSpec | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return (
    DEFAULT_ROLE_ACCOUNTS.find(
      (acct) =>
        acct.email.toLowerCase() === clean ||
        acct.aliases?.some((alias) => alias.toLowerCase() === clean),
    ) ?? null
  );
}

export function matchesDefaultAccountPassword(
  account: DefaultAccountSpec,
  candidatePassword: string,
): boolean {
  return account.acceptedPasswords.includes(candidatePassword);
}
