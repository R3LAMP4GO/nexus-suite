"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";

type UserMembership = {
  membershipId: string;
  role: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  memberships: UserMembership[];
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-900/50 text-purple-400 border border-purple-800",
  ADMIN: "bg-blue-900/50 text-blue-400 border border-blue-800",
  MEMBER: "bg-gray-800 text-gray-400 border border-gray-700",
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const { data, isLoading, refetch } = api.admin.listAllUsers.useQuery({
    search: search || undefined,
    limit: 50,
  });

  const updateRole = api.admin.updateUserRole.useMutation({
    onSuccess: () => {
      refetch();
      setOpenMenuId(null);
    },
  });

  const suspendUser = api.admin.suspendUser.useMutation({
    onSuccess: () => {
      refetch();
      setOpenMenuId(null);
    },
  });

  const inviteUser = api.admin.inviteUser.useMutation({
    onSuccess: () => {
      refetch();
      setShowInvite(false);
      setInviteEmail("");
      setInviteName("");
    },
  });

  function handleRoleChange(membershipId: string, role: "OWNER" | "ADMIN" | "MEMBER") {
    updateRole.mutate({ membershipId, role });
  }

  function handleSuspend(userId: string) {
    if (!window.confirm("Suspend this user? All memberships and sessions will be removed.")) {
      return;
    }
    suspendUser.mutate({ userId, action: "SUSPEND" });
  }

  const users = (data?.users ?? []) as UserRow[];

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="mt-1 text-sm text-gray-400">
              Manage user roles, access, and memberships
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + Invite User
            </button>
          </div>
        </div>

        {/* Invite modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
              <h2 className="mb-1 text-lg font-bold text-white">Invite User</h2>
              <p className="mb-5 text-sm text-gray-400">
                Pre-register an email address. The user can then sign in via email magic link or Google OAuth.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteEmail) return;
                  inviteUser.mutate({ email: inviteEmail, name: inviteName || undefined });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    required
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {inviteUser.error && (
                  <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
                    {inviteUser.error.message}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInvite(false);
                      setInviteEmail("");
                      setInviteName("");
                      inviteUser.reset();
                    }}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteUser.isPending || !inviteEmail}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {inviteUser.isPending ? "Inviting..." : "Send Invite"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900 shadow">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/30">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-gray-300">
                          {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <span className="text-sm font-medium text-gray-200">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {user.memberships.length === 0 ? (
                        <span className="text-gray-600 italic">No org</span>
                      ) : (
                        user.memberships.map((m) => (
                          <div key={m.membershipId} className="text-gray-300">
                            {m.orgName}
                            <span className="ml-1 text-xs text-gray-500">
                              ({m.orgSlug})
                            </span>
                          </div>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.memberships.map((m) => (
                        <span
                          key={m.membershipId}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            ROLE_COLORS[m.role] ?? ROLE_COLORS.MEMBER
                          }`}
                        >
                          {m.role}
                        </span>
                      ))}
                      {user.memberships.length === 0 && (
                        <span className="text-xs italic text-red-400">Suspended</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() =>
                            setOpenMenuId(openMenuId === user.id ? null : user.id)
                          }
                          className="rounded-md bg-gray-800 px-3 py-1 text-sm text-gray-300 transition hover:bg-gray-700"
                        >
                          •••
                        </button>
                        {openMenuId === user.id && (
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl">
                            {user.memberships.map((m) => (
                              <div key={m.membershipId}>
                                <div className="px-3 py-1 text-xs text-gray-500">
                                  {m.orgName} — Role
                                </div>
                                {(["OWNER", "ADMIN", "MEMBER"] as const).map((role) => (
                                  <button
                                    key={role}
                                    onClick={() =>
                                      handleRoleChange(m.membershipId, role)
                                    }
                                    disabled={m.role === role || updateRole.isPending}
                                    className={`block w-full px-3 py-1.5 text-left text-sm transition ${
                                      m.role === role
                                        ? "bg-blue-900/30 text-blue-400"
                                        : "text-gray-300 hover:bg-gray-700"
                                    } disabled:opacity-50`}
                                  >
                                    {role === m.role ? `✓ ${role}` : role}
                                  </button>
                                ))}
                              </div>
                            ))}
                            <div className="my-1 border-t border-gray-700" />
                            <button
                              onClick={() => handleSuspend(user.id)}
                              disabled={suspendUser.isPending}
                              className="block w-full px-3 py-1.5 text-left text-sm text-red-400 transition hover:bg-red-900/30 disabled:opacity-50"
                            >
                              Suspend User
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(updateRole.error || suspendUser.error) && (
          <div className="mt-4 rounded-md bg-red-900/50 p-3 text-sm text-red-400">
            {updateRole.error?.message ?? suspendUser.error?.message}
          </div>
        )}
      </div>
    </div>
  );
}
