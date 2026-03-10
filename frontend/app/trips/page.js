"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../components/LanguageContext";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import { api } from "../../lib/api";

export default function TripsPage() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getTrips().then(setData);
  }, []);

  const pageSize = 6;
  const filtered = useMemo(() => {
    const list = data?.trips || [];
    if (filter === "safe") return list.filter((x) => (x.safety_score ?? 100) >= 80);
    if (filter === "risky") return list.filter((x) => (x.safety_score ?? 100) < 80);
    return list;
  }, [data, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [filter]);

  if (!data) return null;

  return (
    <div className="page-section">
      <div className="row between wrap gap-3">
        <div className="col">
          <div className="page-title">{t("trips")}</div>
          <div className="muted">Filter and inspect trip quality signals</div>
        </div>
        <div className="chip-row" role="tablist" aria-label="Trip filters">
          <button className={`chip ${filter === "all" ? "chip-active" : ""}`} onClick={() => setFilter("all")} role="tab" aria-selected={filter === "all"}>
            All
          </button>
          <button className={`chip ${filter === "safe" ? "chip-active" : ""}`} onClick={() => setFilter("safe")} role="tab" aria-selected={filter === "safe"}>
            Safe
          </button>
          <button className={`chip ${filter === "risky" ? "chip-active" : ""}`} onClick={() => setFilter("risky")} role="tab" aria-selected={filter === "risky"}>
            Risky
          </button>
        </div>
      </div>

      <div className="mt-4">
        <Card title="Recent Trips" subtitle={`${filtered.length} trips • page ${page} of ${totalPages}`}>
          <div style={{ overflowX: "auto" }}>
            <table className="ui-table" role="table" aria-label="Trips table">
              <thead>
                <tr>
                  <th>{t("tripsTableTripId")}</th>
                  <th>{t("tripsTableStart")}</th>
                  <th>{t("tripsTableEnd")}</th>
                  <th>{t("tripsTableDuration")}</th>
                  <th>{t("tripsTableFare")}</th>
                  <th>{t("tripsTableRating")}</th>
                  <th>Safety</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((trip) => {
                  const score = trip.safety_score ?? 100;
                  const tone = score >= 80 ? "success" : "danger";
                  return (
                    <tr
                      key={trip.id}
                      tabIndex={0}
                      onClick={() => setSelected(trip)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelected(trip);
                      }}
                      aria-label={`Trip ${trip.id} details`}
                    >
                      <td style={{ fontWeight: 900 }}>{trip.id}</td>
                      <td>{trip.from}</td>
                      <td>{trip.to}</td>
                      <td>{trip.duration}</td>
                      <td>₹{Number(trip.fare || 0).toFixed(2)}</td>
                      <td>{trip.rating}</td>
                      <td>
                        <Badge tone={tone}>{score}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 row between wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              ariaLabel="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </Button>
            <div className="muted" style={{ fontWeight: 800 }}>
              Page {page} / {totalPages}
            </div>
            <Button
              variant="secondary"
              size="sm"
              ariaLabel="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </Card>
      </div>

      {selected && (
        <div className="mt-4">
          <Card title="Trip Details" subtitle={`${selected.from} → ${selected.to}`} variant="elevated">
            <div className="row between wrap gap-3">
              <div className="col">
                <div className="muted" style={{ fontSize: 12 }}>Trip ID</div>
                <div style={{ fontWeight: 900 }}>{selected.id}</div>
              </div>
              <div className="col">
                <div className="muted" style={{ fontSize: 12 }}>Fare</div>
                <div style={{ fontWeight: 900 }}>₹{Number(selected.fare || 0).toFixed(2)}</div>
              </div>
              <div className="col">
                <div className="muted" style={{ fontSize: 12 }}>Rating</div>
                <div style={{ fontWeight: 900 }}>{selected.rating}</div>
              </div>
              <div className="col">
                <div className="muted" style={{ fontSize: 12 }}>Safety</div>
                <div style={{ fontWeight: 900 }}>{selected.safety_score ?? "—"}</div>
              </div>
            </div>
            <div className="mt-4 row between">
              <div className="muted">Harsh brakes</div>
              <div style={{ fontWeight: 900 }}>{selected.harsh_brakes ?? selected.harsh_brakes ?? 0}</div>
            </div>
            <div className="mt-2 row between">
              <div className="muted">Duration</div>
              <div style={{ fontWeight: 900 }}>{selected.duration}</div>
            </div>
            <div className="mt-4">
              <Button variant="ghost" size="sm" ariaLabel="Close details" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}