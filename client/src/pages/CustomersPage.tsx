import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import CustomerTable from "@/components/CustomerTable";
import type { MapCustomer } from "@shared/types/map-customer";
import type { CustomerListResponse } from "@shared/types/customer-list";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCustomersPage } from "@/lib/customerApi";

const statusLabels: Record<MapCustomer["status"], string> = {
  active: "Aktiv",
  potential: "Potenziell",
  inactive: "Inaktiv"
};

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState({
    active: true,
    potential: true,
    inactive: true
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const { data, isLoading, isFetching } = useQuery<CustomerListResponse>({
    queryKey: ["/admin-api/search/customer", { page, pageSize, search: debouncedSearch }],
    queryFn: async () => {
      return fetchCustomersPage({ page, limit: pageSize, search: debouncedSearch || undefined });
    },
    placeholderData: (previous) => previous,
  });

  const customers = (data?.customers ?? []) as MapCustomer[];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = startIndex === 0 ? 0 : startIndex + customers.length - 1;

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => statusFilter[customer.status]);
  }, [customers, statusFilter]);

  const handleStatusChange = (status: keyof typeof statusFilter) => (checked: boolean | "indeterminate") => {
    setStatusFilter((prev) => ({
      ...prev,
      [status]: Boolean(checked)
    }));
    setPage(1);
  };

  const goToPreviousPage = () => {
    setPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <>
      <TopBar
        title="Kunden"
        showSearch={false}
      />
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto">
            <Card className="p-4">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2 w-full xl:max-w-sm">
                  <Label htmlFor="customer-search">Suche</Label>
                  <Input
                    id="customer-search"
                    placeholder="Nach Name, E-Mail oder Firma suchen"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(Object.keys(statusFilter) as Array<keyof typeof statusFilter>).map((status) => (
                    <label key={status} className="flex items-center space-x-2 text-sm">
                      <Checkbox
                        checked={statusFilter[status]}
                        onCheckedChange={handleStatusChange(status)}
                      />
                      <span>{statusLabels[status]}</span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {total === 0 ? 0 : `${startIndex}–${endIndex}`}
                    </span>
                    <span>von</span>
                    <span className="font-medium text-foreground">{total}</span>
                    <span>Kunden</span>
                  </div>
                  <div>
                    Seite <span className="font-medium text-foreground">{page}</span> von {totalPages}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Zeilen pro Seite</span>
                    <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(Number.parseInt(value, 10))}>
                      <SelectTrigger className="h-8 w-20 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[50, 100, 200, 500].map((size) => (
                          <SelectItem key={size} value={size.toString()}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>

            <CustomerTable
              customers={filteredCustomers}
              isLoading={isLoading || isFetching}
            />

            <div className="flex items-center justify-between py-2">
              <Button variant="outline" onClick={goToPreviousPage} disabled={page <= 1}>
                Zurück
              </Button>
              <span className="text-sm text-muted-foreground">
                Seite {page} von {totalPages}
              </span>
              <Button variant="outline" onClick={goToNextPage} disabled={page >= totalPages}>
                Weiter
              </Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
