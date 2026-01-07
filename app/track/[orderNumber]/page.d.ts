export interface PageProps {
  params: {
    orderNumber: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
}
