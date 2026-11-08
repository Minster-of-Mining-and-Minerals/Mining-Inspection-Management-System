"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Camera, Loader2, Lock } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUploadAttachmentsMutation } from "@/redux/api/attachementApi";
import { useGetProfileQuery, useUpdateProfileMutation } from "@/redux/api/profileApi";
import { getFileUrl } from "@/utils/fileUrl";

// Identity fields are managed by the administrator, so only the password is editable here.
const passwordFormSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 truncate">
        {value || "—"}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: profileResponse, isLoading: isLoadingProfile } = useGetProfileQuery();
  const [updateProfile, { isLoading: isUpdating }] = useUpdateProfileMutation();
  const [uploadAttachments, { isLoading: isUploadingImage }] = useUploadAttachmentsMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });

  async function onSubmit(data: PasswordFormValues) {
    try {
      const response = await updateProfile({
        password: data.password,
        confirm_password: data.confirmPassword,
      } as any).unwrap();

      if (response.success) {
        toast.success("Password updated successfully");
        form.reset({ password: "", confirmPassword: "" });
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to update password");
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    try {
      const result = await uploadAttachments({ files: [file] }).unwrap();
      if (result.success && result.attachments.length > 0) {
        const attachmentId = result.attachments[0].attachment_id;
        await updateProfile({ profile_image_id: attachmentId }).unwrap();
        toast.success("Profile picture updated");
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to upload image");
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const profile = profileResponse?.data;
  const names = profile?.full_name?.split(" ") ?? [];
  const firstName = names[0] || "";
  const lastName = names.slice(1).join(" ");
  const initials = names.length
    ? names
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  const profileImageUrl = profile?.profileImage?.file_path
    ? getFileUrl(profile.profileImage.file_path)
    : "";

  return (
    <main className="w-full py-2 sm:py-4">
      {/* Banner */}
      <section className="relative h-28 overflow-hidden rounded-xl bg-primary sm:h-36">
        <div className="absolute inset-0 bg-[url('/images/hero-bg-contours.svg')] bg-cover bg-center opacity-30" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-golden-bright" />
      </section>

      {/* Identity strip overlapping the banner */}
      <section className="relative -mt-14 flex flex-col items-center gap-3 px-4 text-center sm:-mt-16 sm:flex-row sm:items-end sm:gap-5 sm:px-6 sm:text-left">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingImage}
          className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-golden-bright focus-visible:ring-offset-2"
          aria-label="Change profile picture"
          title="Change profile picture"
        >
          <Avatar className="h-28 w-28 border-[5px] border-white bg-white shadow-lg sm:h-32 sm:w-32">
            <AvatarImage src={profileImageUrl} className="object-cover" />
            <AvatarFallback className="bg-[#DCE7EE] text-4xl font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-1.5 right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-golden-deep text-white transition-transform group-hover:scale-110">
            {isUploadingImage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        <div className="min-w-0 flex-1 sm:pb-2">
          <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
            {profile?.full_name}
          </h1>
          <div className="mt-1.5 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-[#FBF3DC] px-2.5 py-0.5 text-xs font-semibold text-golden-deep">
              {profile?.userType?.name || "User"}
            </span>
            {profile?.sectorNode && (
              <span className="max-w-[16rem] truncate rounded-full bg-[#E2ECF2] px-2.5 py-0.5 text-xs font-semibold text-primary">
                {profile.sectorNode.name}
              </span>
            )}
          </div>
        </div>
        <p className="hidden pb-3 text-xs text-slate-500 sm:block">
          Click the photo to change it
        </p>
      </section>

      {/* Cards */}
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-primary">Account details</h2>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Managed by administrator
            </span>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="First name" value={firstName} />
            <ReadOnlyField label="Last name" value={lastName} />
            <div className="sm:col-span-2">
              <ReadOnlyField label="Email" value={profile?.email} />
            </div>
            <div className="sm:col-span-2">
              <ReadOnlyField label="Phone number" value={profile?.phone_number ?? undefined} />
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold text-primary">Change password</h2>
          <p className="mt-1 text-sm text-slate-500">At least 6 characters.</p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 flex flex-1 flex-col">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-slate-700">New password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-slate-700">Confirm new password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-auto flex justify-end pt-6">
                <Button type="submit" className="px-6" disabled={isUpdating || !form.formState.isValid}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save password"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </section>
    </main>
  );
}
