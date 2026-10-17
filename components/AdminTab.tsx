"use client";
import { useEffect, useState } from "react";
import { Trash2, ShieldCheck, ShieldOff, UserPlus, Loader2, RefreshCw } from "lucide-react";
import {
  listUsers,
  updateUserRole,
  updateUserProfile,
  deleteUser,
  inviteUser,
  resendInvite,
  type UserRow,
} from "@/app/settings/account/admin-actions";

function Avatar({ name, email }: { name: string | null; email: string }) {
  const letters = (name || email).slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-amber-400/20 border border-amber-400/30 flex items-center justify-center shrink-0">
      <span className="text-amber-400 font-mono font-bold text-xs">{letters}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: "admin" | "user" }) {
  return role === "admin" ? (
    <span className="inline-flex items-center gap-1 bg-amber-400/15 text-amber-400 font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">
      ADMIN
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 bg-[#2e2e38] text-[#7a7870] font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">
      USER
    </span>
  );
}

function InvitedBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 font-mono text-[10px] tracking-widest px-2 py-0.5 rounded">
      INVITED
    </span>
  );
}

type EditState = { userId: string; username: string } | null;

export default function AdminTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    // Allow E2E tests to inject a user list without calling the server action
    const injected = typeof window !== "undefined" && (window as any).__TEST_ADMIN_USERS__;
    if (injected) {
      setUsers(injected);
      setLoading(false);
      return;
    }
    listUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  function flash(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  }

  async function handleRoleToggle(user: UserRow) {
    const newRole = user.role === "admin" ? "user" : "admin";
    const result = await updateUserRole(user.id, newRole);
    if (result.error) { flash(result.error); return; }
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
    );
  }

  async function handleDelete(userId: string) {
    if (confirmDelete !== userId) { setConfirmDelete(userId); return; }
    const result = await deleteUser(userId);
    if (result.error) { flash(result.error); setConfirmDelete(null); return; }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setConfirmDelete(null);
  }

  async function handleResend(user: UserRow) {
    setResending(user.id);
    const result = await resendInvite(user.email);
    setResending(null);
    flash(result.error ? result.error : `Invite resent to ${user.email}.`);
  }

  async function handleEditSave() {
    if (!editState) return;
    setEditSaving(true);
    setEditError(null);
    const result = await updateUserProfile(editState.userId, {
      username: editState.username || undefined,
    });
    setEditSaving(false);
    if (result.error) { setEditError(result.error); return; }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editState.userId
          ? { ...u, username: editState.username || null }
          : u
      )
    );
    setEditState(null);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const result = await inviteUser(inviteEmail);
    setInviting(false);
    if (result.error) {
      setInviteMsg({ text: result.error, error: true });
    } else {
      setInviteMsg({ text: `Invite sent to ${inviteEmail}.`, error: false });
      setInviteEmail("");
    }
    setTimeout(() => setInviteMsg(null), 4000);
  }

  return (
    <div>
      {/* Invite user */}
      <div className="bg-[#18181c] border border-[#2e2e38] rounded-xl p-5 mb-8">
        <p className="text-xs font-mono text-amber-400 tracking-widest mb-3">INVITE USER</p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="flex-1 bg-[#0f0f11] border border-[#2e2e38] rounded-lg px-4 py-2.5 text-sm text-[#e8e6df] placeholder-[#4a4a55] focus:outline-none focus:border-amber-500 transition-colors"
          />
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-medium text-sm rounded-lg px-4 py-2.5 transition-colors shrink-0"
          >
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Invite
          </button>
        </form>
        {inviteMsg && (
          <p className={`text-xs mt-2 ${inviteMsg.error ? "text-red-400" : "text-emerald-400"}`}>
            {inviteMsg.text}
          </p>
        )}
      </div>

      {/* Flash message */}
      {actionMsg && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4">
          {actionMsg}
        </p>
      )}

      {/* User list */}
      <p className="text-[#7a7870] text-xs tracking-widest uppercase mb-4">
        All Users ({users.length})
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[#7a7870]" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-[#7a7870] text-sm text-center py-8">No other users yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((user) => (
            <div
              key={user.id}
              data-testid="user-row"
              className="bg-[#18181c] border border-[#2e2e38] rounded-xl overflow-hidden"
            >
              {/* User row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Avatar name={user.username} email={user.email} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium truncate ${user.invited ? "text-[#7a7870]" : "text-white"}`}>
                      {user.username ? `@${user.username}` : (user.invited ? "Pending…" : user.email)}
                    </span>
                    {user.invited ? <InvitedBadge /> : <RoleBadge role={user.role} />}
                  </div>
                  <p className="text-xs text-[#7a7870] truncate">{user.email}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {user.invited ? (
                    // Invited (pending) users get resend + cancel only
                    <>
                      <button
                        onClick={() => handleResend(user)}
                        disabled={resending === user.id}
                        title="Resend invite"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {resending === user.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Resend
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                          confirmDelete === user.id
                            ? "text-red-400 bg-red-500/15"
                            : "text-[#7a7870] hover:text-red-400 hover:bg-red-500/10"
                        }`}
                        title={confirmDelete === user.id ? "Click again to confirm" : "Cancel invite"}
                      >
                        {confirmDelete === user.id ? "Confirm" : "Cancel invite"}
                      </button>
                    </>
                  ) : (
                    // Active users get edit + role toggle + delete
                    <>
                      <button
                        onClick={() =>
                          setEditState({
                            userId: user.id,
                            username: user.username ?? "",
                          })
                        }
                        className="px-2.5 py-1.5 text-xs text-[#7a7870] hover:text-white bg-[#0f0f11] hover:bg-[#2e2e38] rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRoleToggle(user)}
                        title={user.role === "admin" ? "Revoke admin" : "Make admin"}
                        className="p-1.5 text-[#7a7870] hover:text-amber-400 rounded-lg hover:bg-amber-400/10 transition-colors"
                      >
                        {user.role === "admin" ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          confirmDelete === user.id
                            ? "text-red-400 bg-red-500/15"
                            : "text-[#7a7870] hover:text-red-400 hover:bg-red-500/10"
                        }`}
                        title={confirmDelete === user.id ? "Click again to confirm" : "Delete user"}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Confirm delete banner */}
              {confirmDelete === user.id && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-red-500/10 border-t border-red-500/20">
                  <p className="text-xs text-red-400">
                    {user.invited
                      ? "This cancels the invite and removes the pending account."
                      : "This permanently deletes the account. Click confirm to proceed."}
                  </p>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-[#7a7870] hover:text-white ml-4 shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Inline edit form */}
              {editState?.userId === user.id && (
                <div className="px-4 py-4 border-t border-[#2e2e38] flex flex-col gap-3 bg-[#0f0f11]">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a7870] text-sm select-none">@</span>
                      <input
                        value={editState.username}
                        onChange={(e) =>
                          setEditState((s) =>
                            s && { ...s, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }
                          )
                        }
                        placeholder="username"
                        className="w-full bg-[#18181c] border border-[#2e2e38] rounded-lg pl-7 pr-3 py-2 text-sm text-[#e8e6df] placeholder-[#4a4a55] focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                  </div>
                  {editError && <p className="text-xs text-red-400">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditSave}
                      disabled={editSaving}
                      className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-medium text-xs rounded-lg px-4 py-2 transition-colors"
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setEditState(null); setEditError(null); }}
                      className="text-xs text-[#7a7870] hover:text-white px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
