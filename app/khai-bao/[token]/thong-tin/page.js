import ReleaseInfoFormPage from "../../../../lib/ReleaseInfoFormPage";

// Round 697 — step 2 of the public /khai-bao form: "Thông tin phát hành". Same signed token as the rights form. Reached from the rights form's done screen
// (link shown only when NEXT_PUBLIC_RELEASE_INFO_STEP2=1) or by direct link.
export default function KhaiBaoStep2Page({ params }) {
  return <ReleaseInfoFormPage token={decodeURIComponent(params.token || "")} />;
}
