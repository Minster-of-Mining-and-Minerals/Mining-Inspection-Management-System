"use client";
import { useSession } from "next-auth/react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useGetRolesQuery } from "@/redux/api/roleApi";
import {
  useCreateUserMutation,
  useGetUserTypesQuery,
} from "@/redux/api/userApi";
import { CreateUserPayload } from "@/redux/types/user";
import { Check, ChevronDown, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocale } from "next-intl";
import { useGetSectorNodesQuery } from "@/redux/api/sectorNodeApi";
import { useSelectedSectorId } from "@/lib/sectorSelection";
import { localizedName } from "@/utils/localizedName";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";
import { useGetTeamsQuery } from "@/redux/api/teamApi";
import { usePermissions } from "@/hooks/usePermissions";

const NO_TEAM = "none";

interface CreateUserModalProps {
  user_type?: string;
  sector_node_id?: string;
  /** Opened from a team page: the new user goes into this team */
  presetTeamId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  user_type,
  sector_node_id,
  presetTeamId,
  isOpen,
  onClose,
}) => {
  const { check } = usePermissions();
  const canAssignTeam = check({ allPermissions: ["TEAMS:MANAGE_MEMBERS"] });
  const [teamId, setTeamId] = useState(presetTeamId || NO_TEAM);
  const [teamLeader, setTeamLeader] = useState(false);
  const { data: teamsResponse } = useGetTeamsQuery({ is_active: true, limit: 100 }, { skip: !isOpen || !canAssignTeam });
  const allTeams = teamsResponse?.data ?? [];
  const hasTeam = teamId !== NO_TEAM;
  const locale = useLocale();

  // Each time the form opens from a team page, start with that team
  useEffect(() => {
    if (isOpen) {
      setTeamId(presetTeamId || NO_TEAM);
      setTeamLeader(false);
    }
  }, [isOpen, presetTeamId]);
  const { data: session, status } = useSession();
  // console.log("session: ", session)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  // Set when the welcome email failed: the password is shown once to hand over
  const [tempPassword, setTempPassword] = useState<{ password: string; email: string } | null>(null);

  // Sector users always create users in their own sector (the backend enforces it).
  // Central users choose: a sector, or "Central Admin" for another central user.
  const isCentral = !!session?.user?.is_central;
  const switcherSectorId = useSelectedSectorId();
  // Until chosen here: the sector chosen in the page's Sector filter
  const [sectorChoice, setSectorId] = useState<string | null>(null);
  const sectorId = sectorChoice ?? switcherSectorId ?? "";

  const { data: rolesResponse } = useGetRolesQuery();
  const { data: sectorNodes } = useGetSectorNodesQuery({ limit: 100, is_active: true }, { skip: !isCentral });
  const { data: userTypes = [] } = useGetUserTypesQuery();

  // Only roles this user may give: global or of the chosen sector, and (for sector users)
  // with no permissions they don't have themselves
  const targetSectorId = sector_node_id || (isCentral ? sectorId : session?.user?.sector?.sector_node_id);
  // Teams of the new user's sector only
  const teams = allTeams.filter((t) => !targetSectorId || !t.sector_node_id || t.sector_node_id === targetSectorId);
  const roles = (rolesResponse || []).filter(
    (r) => r.is_active !== false && r.can_assign !== false && (!r.sector_node_id || r.sector_node_id === targetSectorId),
  );
  // The root ("Central Admin") first, then the sectors
  const sectors = [...(sectorNodes?.data ?? [])].sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id));

  const [createUser, { isLoading }] = useCreateUserMutation();
  const userTypeId = userTypes?.find(
    (type: any) => type.name === user_type
  )?.user_type_id;

  const handleSectorChange = (value: string) => {
    setSectorId(value);
    // Roles of another sector no longer apply
    setSelectedRoles((prev) => prev.filter((id) => {
      const r = (rolesResponse || []).find((x) => x.role_id === id);
      return !!r && (!r.sector_node_id || r.sector_node_id === value);
    }));
  };

  const handleSubmit = async () => {
    // A role is required, unless the person joins a team (that gives the inspector role)
    if (!fullName || !email || (!selectedRoles.length && !hasTeam)) {
      toast.error("Please fill all required fields");
      return;
    }

    if (isCentral && !sector_node_id && !sectorId) {
      toast.error("Choose the sector this user belongs to");
      return;
    }

    if (user_type && !userTypeId) {
      toast.error("User type not resolved yet");
      return;
    }

    const payload: CreateUserPayload = {
      full_name: fullName,
      email,
      role_ids: selectedRoles,
      user_type_id: userTypeId || "",
      ...(
        sector_node_id
          ? { sector_node_id }
          : sectorId
            ? { sector_node_id: sectorId }
            : {}
      ),
      ...(phoneNumber && { phone_number: phoneNumber }),
      ...(userTypeId && { user_type_id: userTypeId }),
      ...(hasTeam && { team_id: teamId, team_role: teamLeader ? "leader" : "member" }),
    };

    try {
      const result = await createUser(payload).unwrap();
      if (!result.email_sent && result.temporary_password) {
        toast.warning("User created, but the welcome email could not be sent.");
        setTempPassword({ password: result.temporary_password, email });
      } else {
        toast.success("User created. The temporary password was sent by email.");
      }
      handleClose();
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to create user");
    }
  };

  const handleClose = () => {
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setSelectedRoles([]);
    setSectorId(null);
    setTeamId(presetTeamId || NO_TEAM);
    setTeamLeader(false);
    onClose();
  };

  const passwordDialog = (
    <TemporaryPasswordDialog
      password={tempPassword?.password ?? null}
      email={tempPassword?.email}
      onClose={() => setTempPassword(null)}
    />
  );

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // Keep the password dialog alive after the form itself closes
  if (!isOpen) return passwordDialog;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white p-6 rounded-2xl w-full max-w-[700px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-primary">Create User</h2>
          <button
            onClick={handleClose}
            className="text-primary hover:text-gray-600 transition"
          >
            <XIcon className="w-6 h-6 cursor-pointer" />
          </button>
        </div>

        {/* Content */}
        <div className="w-full flex flex-col space-y-4">
          {/* User Detail */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4  mt-2 pr-2">
            {/* Sector: central users only (sector users' new users join their own sector) */}
            {isCentral && !sector_node_id && user_type === "internal" && (
              <div className="w-full space-y-2 md:col-span-2">
                <Label className="block text-sm text-golden-dark font-medium mb-2">
                  Sector <span className="text-red-500">*</span>
                </Label>

                <Select
                  value={sectorId} onValueChange={handleSectorChange} disabled={isLoading}
                >
                  <SelectTrigger className="w-full h-12 border border-golden-dark focus:ring focus:ring-golden-dark focus:border-transparent rounded-md transition-all duration-200 outline-none px-4 py-3 text-primary bg-white">
                    <SelectValue placeholder="Select Sector" />
                  </SelectTrigger>

                  <SelectContent className="text-primary bg-white max-h-64 overflow-y-auto">
                    {sectors.map((s) => (
                      <SelectItem
                        key={s.sector_node_id}
                        value={s.sector_node_id}
                      >
                        {s.parent_id ? localizedName(s, locale) : `${localizedName(s, locale)} (central)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="block text-sm text-golden-dark font-medium mb-2">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full h-12 border border-golden-dark "
              />
            </div>
            <div className="space-y-2">
              <Label className="block text-sm text-golden-dark font-medium mb-2">
                Phone Number <span className="text-xs font-normal text-slate-400">(optional)</span>
              </Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+251 9xxxxxxx"
                className="w-full h-12 border border-golden-dark "
              />
            </div>
            <div className="space-y-2">
              <Label className="block text-sm text-golden-dark font-medium mb-2">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full h-12 border border-golden-dark"
              />
            </div>
            {/* ROLE */}
            {/* ROLE MULTI SELECT */}

            <div className="w-full space-y-2">
              <Label className="text-sm font-medium text-golden-dark">
                Role <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full max-h-28 min-h-12 h-fit border border-golden-dark p-2 rounded-md mt-1 text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-golden-dark   transition-all duration-200"
                  >
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      {selectedRoles.length === 0 && (
                        <span className="text-sm w-full justify-between text-gray-400 flex items-center gap-2">
                          Select Role
                          <ChevronDown className="h-4 w-4 ml-auto" />
                        </span>
                      )}

                      {selectedRoles.map((roleId) => {
                        const r = roles.find(
                          (rr: any) => rr.role_id === roleId
                        );
                        if (!r) return null;

                        return (
                          <span
                            key={roleId}
                            className="inline-flex items-center gap-1 rounded-sm justify-center bg-primary/10 text-primary pl-2  text-xs"
                          >
                            <span className="truncate max-w-[120px] py-1">
                              {r.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRoles((prev) =>
                                  prev.filter((id) => id !== roleId)
                                );
                              }}
                              className="flex px-1 rounded-r-sm items-center justify-center py-1  hover:text-white  hover:bg-red-500 transition-colors"
                              aria-label={`Remove ${r.name}`}
                            >
                              <XIcon className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                      {selectedRoles.length > 0 && (
                        <ChevronDown className="h-4 w-4 ml-auto text-gray-400" />
                      )}
                    </div>
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  className="w-[300px] p-2 bg-white"
                  align="start"
                >
                  <div className="max-h-64 overflow-y-auto">
                    {roles
                      .filter((r: any) => !selectedRoles.includes(r.role_id))
                      .map((r: any) => (
                        <button
                          key={r.role_id}
                          type="button"
                          onClick={() => {
                            setSelectedRoles((prev) => [...prev, r.role_id]);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/10 rounded-md cursor-pointer transition-colors"
                        >
                          <span className="block truncate">{r.name}</span>
                        </button>
                      ))}
                    {roles.filter(
                      (r: any) => !selectedRoles.includes(r.role_id)
                    ).length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-400 text-center">
                          All roles selected
                        </div>
                      )}
                  </div>
                </PopoverContent>
              </Popover>
              {hasTeam && !selectedRoles.length && (
                <p className="text-xs text-slate-500">Team members get the inspector role automatically.</p>
              )}
            </div>

            {/* TEAM (optional): a person can be in one team only */}
            {canAssignTeam && (
              <div className="w-full space-y-2">
                <Label className="block text-sm text-golden-dark font-medium mb-2">
                  Team <span className="text-xs font-normal text-slate-400">(optional)</span>
                </Label>
                <Select value={teamId} onValueChange={setTeamId} disabled={isLoading || !!presetTeamId}>
                  <SelectTrigger className="w-full h-12 border border-golden-dark rounded-md px-4 text-primary bg-white">
                    <SelectValue placeholder="No team" />
                  </SelectTrigger>
                  <SelectContent className="text-primary bg-white max-h-64 overflow-y-auto">
                    <SelectItem value={NO_TEAM}>No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.team_id} value={t.team_id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasTeam && (
                  <label className="flex items-center gap-2 text-sm text-primary">
                    <input
                      type="checkbox"
                      checked={teamLeader}
                      onChange={(e) => setTeamLeader(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Team leader
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="min-w-24"
          >
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
};
