import { createBrowserRouter, Navigate, useParams } from "react-router";
import { RouteErrorPage } from "@/app/router/route-error-page";
import { AdminShell } from "@/app/shell/admin-shell";
import { SignInPage } from "@/features/auth/routes/sign-in-page";
import { SignUpPage } from "@/features/auth/routes/sign-up-page";
import { VerifyEmailPage } from "@/features/auth/routes/verify-email-page";
import {
  GuestOnly,
  RequireSession,
  RootRoute,
} from "@/features/auth/routing/session-guards";
import { BookingsPage } from "@/features/bookings/bookings-page";
import {
  OrganizationAccessGate,
  OrganizationRequestRoute,
  OrganizationResolver,
} from "@/features/organizations/components/organization-route-states";
import { PlatformAccessGate } from "@/features/platform/platform-access-gate";
import { PlatformOrganizationsPage } from "@/features/platform/platform-organizations-page";
import { PlatformPublicationsPage } from "@/features/platform/platform-publications-page";
import { PlatformRequestsPage } from "@/features/platform/platform-requests-page";
import { PlatformShell } from "@/features/platform/platform-shell";
import { GuestBookingManagePage } from "@/features/public-booking/routes/guest-booking-manage-page";
import { PublicBookingPage } from "@/features/public-booking/routes/public-booking-page";
import { ResourcesPage } from "@/features/resources/resources-page";
import { SchedulePage } from "@/features/schedule/schedule-page";
import { ServicesPage } from "@/features/services/services-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { AcceptInvitationPage } from "@/features/team/routes/accept-invitation-page";
import { TeamPage } from "@/features/team/team-page";
import { NotFoundPage } from "@/shared/components/app-state-page";
import { UnsavedChangesProvider } from "@/shared/unsaved-changes/unsaved-changes";

function OrganizationNotFoundPage() {
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  return (
    <NotFoundPage
      compact
      destination={`/app/${organizationId}/bookings`}
      actionLabel="Back to Bookings"
    />
  );
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: "/book/:slug",
        element: <PublicBookingPage />,
      },
      {
        path: "/booking/manage",
        element: (
          <UnsavedChangesProvider>
            <GuestBookingManagePage />
          </UnsavedChangesProvider>
        ),
      },
      { path: "/", element: <RootRoute /> },
      {
        element: <GuestOnly />,
        children: [
          { path: "/login", element: <SignInPage /> },
          { path: "/sign-up", element: <SignUpPage /> },
        ],
      },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      {
        element: <RequireSession />,
        children: [
          { path: "/invitations/accept", element: <AcceptInvitationPage /> },
          {
            path: "/app",
            children: [
              {
                index: true,
                element: (
                  <UnsavedChangesProvider>
                    <OrganizationResolver />
                  </UnsavedChangesProvider>
                ),
              },
              {
                path: "request-organization",
                element: (
                  <UnsavedChangesProvider>
                    <OrganizationRequestRoute />
                  </UnsavedChangesProvider>
                ),
              },
              {
                path: ":organizationId",
                element: <OrganizationAccessGate />,
                children: [
                  {
                    element: (
                      <UnsavedChangesProvider>
                        <AdminShell />
                      </UnsavedChangesProvider>
                    ),
                    children: [
                      {
                        index: true,
                        element: <Navigate replace to="bookings" />,
                      },
                      { path: "bookings", element: <BookingsPage /> },
                      { path: "services", element: <ServicesPage /> },
                      { path: "resources", element: <ResourcesPage /> },
                      { path: "schedule", element: <SchedulePage /> },
                      { path: "team", element: <TeamPage /> },
                      { path: "settings", element: <SettingsPage /> },
                      {
                        path: "*",
                        element: <OrganizationNotFoundPage />,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: "/platform",
            element: <PlatformAccessGate />,
            children: [
              {
                element: <PlatformShell />,
                children: [
                  { index: true, element: <Navigate replace to="requests" /> },
                  { path: "requests", element: <PlatformRequestsPage /> },
                  {
                    path: "publications",
                    element: <PlatformPublicationsPage />,
                  },
                  {
                    path: "organizations",
                    element: <PlatformOrganizationsPage />,
                  },
                  {
                    path: "*",
                    element: (
                      <NotFoundPage
                        compact
                        destination="/platform/requests"
                        actionLabel="Back to Requests"
                      />
                    ),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
