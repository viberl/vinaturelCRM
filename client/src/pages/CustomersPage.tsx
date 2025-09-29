import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import CustomerTable from "@/components/CustomerTable";
import type { MapCustomer } from "@shared/types/map-customer";
import api from "@/lib/api";

const statusLabels: Record<MapCustomer["status"], string> = {
  active: "Aktiv",
  potential: "Potenziell",
  inactive: "Inaktiv"
};

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState({
    active: true,
    potential: true,
    inactive: true
  });

  const { data: customers = [], isLoading, isFetching } = useQuery<MapCustomer[]>({
    queryKey: ["/admin-api/search/customer"],
    queryFn: async () => {
      const response = await api.get("/admin-api/search/customer");
      return response.data;
    },
    retry: 1
  });

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return customers.filter((customer) => {
      if (!statusFilter[customer.status]) {
        return false;
      }

      if (!query) return true;

      const searchableValues = [
        customer.name,
        customer.email,
        customer.company ?? "",
        customer.address ?? "",
        customer.customerNumber ?? "",
        customer.customerGroup ?? ""
      ];

      return searchableValues.some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [customers, searchTerm, statusFilter]);

  const counts = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === "active").length;
    const potential = customers.filter((c) => c.status === "potential").length;
    const inactive = customers.filter((c) => c.status === "inactive").length;

    return { total, active, potential, inactive };
  }, [customers]);

  const handleStatusChange = (status: keyof typeof statusFilter) => (checked: boolean | "indeterminate") => {
    setStatusFilter((prev) => ({
      ...prev,
      [status]: Boolean(checked)
    }));
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
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2 w-full lg:max-w-sm">
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
                      <span className="text-muted-foreground">
                        ({counts[status] ?? 0})
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">{counts.total}</span> Kunden gesamt
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{counts.active}</span> aktiv
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{counts.potential}</span> potenziell
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{counts.inactive}</span> inaktiv
                  </div>
                </div>
              </div>
            </Card>

            <CustomerTable
              customers={filteredCustomers}
              isLoading={isLoading || isFetching}
            />
          </div>
        </div>
      </main>
    </>
  );
}
