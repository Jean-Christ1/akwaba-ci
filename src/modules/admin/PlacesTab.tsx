import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RowSkeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./primitives";
import type { PlaceRow } from "./types";

/** Fiches du partenaire, avec accès à l'éditeur de chacune. */
export function PlacesTab({ places, loadBusy }: { places: PlaceRow[]; loadBusy: boolean }) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Ville</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadBusy && places.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <RowSkeleton lines={3} />
              </TableCell>
            </TableRow>
          )}
          {places.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.type}</TableCell>
              <TableCell>{p.city}</TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-right">
                <Link to={`/admin/places/${p.id}`}>
                  <Button variant="ghost" size="sm">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {!loadBusy && places.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                Aucune fiche.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

export default PlacesTab;
