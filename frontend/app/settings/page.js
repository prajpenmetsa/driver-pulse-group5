"use client";

// Settings page:
// Stores goals/notifications/appearance/account in localStorage.
// Dashboard reads goals to compute progress targets.

import { useEffect, useState } from "react";
import { useLanguage } from "../../components/LanguageContext";
import LanguageDropdown from "../../components/LanguageDropdown";
import Card from "../../components/Card";
import CardGrid from "../../components/CardGrid";
import ToggleSwitch from "../../components/ToggleSwitch";

import Button from "../../components/Button";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [goals, setGoals] = useState({ targetEarnings: 10000, targetTrips: 30 });
  const [notifications, setNotifications] = useState({
    trip: true,
    safety: true,
    earnings: true,
    daily: true,
  });
  const [account, setAccount] = useState({ name: "Alex", vehicle: "Toyota Prius • Blue" });
  const [editingAccount, setEditingAccount] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", vehicle: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const g = window.localStorage.getItem("driver_pulse_goals");
    const n = window.localStorage.getItem("driver_pulse_notifications");
    const acc = window.localStorage.getItem("driver_pulse_account");

    if (g) {
      try {
        const parsed = JSON.parse(g);
        setGoals({
          targetEarnings: Number(parsed?.targetEarnings) || 10000,
          targetTrips: Number(parsed?.targetTrips) || 30,
        });
      } catch {}
    }
    if (n) {
      try {
        const parsed = JSON.parse(n);
        setNotifications({
          trip: !!parsed?.trip,
          safety: !!parsed?.safety,
          earnings: !!parsed?.earnings,
          daily: !!parsed?.daily,
        });
      } catch {}
    }
    if (acc) {
      try {
        const parsed = JSON.parse(acc);
        setAccount({
          name: parsed?.name || "Alex",
          vehicle: parsed?.vehicle || "Toyota Prius • Blue",
        });
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("driver_pulse_goals", JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("driver_pulse_notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("driver_pulse_account", JSON.stringify(account));
  }, [account]);

  return (
    <div className="page-section">
      <div className="row between wrap gap-3">
        <div className="col">
          <div className="page-title">{t("settings")}</div>
          <div className="muted">Preferences that shape your dashboard</div>
        </div>
      </div>

      <div className="mt-4">
        <Card title={t("language")} subtitle={t("preferredLanguage")}>
          <LanguageDropdown variant="full" />
          <div className="muted mt-3" style={{ fontSize: 13 }}>
            Language is saved locally and persists after refresh.
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <CardGrid cols={2}>
          <Card title="Driver Goals" subtitle="Used for daily progress + targets">
            <div className="col gap-3">
              <label className="col gap-2" style={{ fontWeight: 800 }}>
                Daily earnings target
                <input
                  className="ui-input"
                  type="number"
                  min={0}
                  value={goals.targetEarnings}
                  onChange={(e) => setGoals((g) => ({ ...g, targetEarnings: Number(e.target.value) }))}
                  aria-label="Daily earnings target"
                />
              </label>
              <label className="col gap-2" style={{ fontWeight: 800 }}>
                Trips target
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  value={goals.targetTrips}
                  onChange={(e) => setGoals((g) => ({ ...g, targetTrips: Number(e.target.value) }))}
                  aria-label="Trips target"
                />
              </label>
            </div>
          </Card>

          <Card title="Notifications" subtitle="Choose which alerts you see">
            <ToggleSwitch
              id="notif-trip"
              label="Trip alerts"
              checked={notifications.trip}
              onChange={(v) => setNotifications((n) => ({ ...n, trip: v }))}
            />
            <ToggleSwitch
              id="notif-safety"
              label="Safety alerts"
              checked={notifications.safety}
              onChange={(v) => setNotifications((n) => ({ ...n, safety: v }))}
            />
            <ToggleSwitch
              id="notif-earnings"
              label="Earnings alerts"
              checked={notifications.earnings}
              onChange={(v) => setNotifications((n) => ({ ...n, earnings: v }))}
            />
            <ToggleSwitch
              id="notif-daily"
              label="Daily summary"
              checked={notifications.daily}
              onChange={(v) => setNotifications((n) => ({ ...n, daily: v }))}
            />
          </Card>
        </CardGrid>
      </div>

      <div className="mt-4">
        <Card title="Account" subtitle="Driver profile and vehicle info">
          {editingAccount ? (
            <div className="col gap-3">
              <label className="col gap-2" style={{ fontWeight: 800 }}>
                Driver name
                <input
                  className="ui-input"
                  type="text"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                  aria-label="Driver name"
                />
              </label>
              <label className="col gap-2" style={{ fontWeight: 800 }}>
                Vehicle
                <input
                  className="ui-input"
                  type="text"
                  value={editDraft.vehicle}
                  onChange={(e) => setEditDraft((d) => ({ ...d, vehicle: e.target.value }))}
                  aria-label="Vehicle"
                />
              </label>
              <div className="row gap-2">
                <Button
                  variant="primary"
                  size="md"
                  ariaLabel="Save account"
                  onClick={() => {
                    setAccount({ name: editDraft.name, vehicle: editDraft.vehicle });
                    setEditingAccount(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  ariaLabel="Cancel editing"
                  onClick={() => setEditingAccount(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="row between wrap gap-3">
              <div className="col">
                <div className="muted" style={{ fontSize: 12 }}>Driver name</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{account.name}</div>
                <div className="muted mt-2" style={{ fontSize: 12 }}>Vehicle</div>
                <div style={{ fontWeight: 800 }}>{account.vehicle}</div>
              </div>
              <Button
                variant="secondary"
                size="md"
                ariaLabel="Edit account"
                onClick={() => {
                  setEditDraft({ name: account.name, vehicle: account.vehicle });
                  setEditingAccount(true);
                }}
              >
                Edit
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

