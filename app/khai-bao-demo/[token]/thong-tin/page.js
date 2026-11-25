import ReleaseInfoFormPage from "../../../../lib/ReleaseInfoFormPage";

export default function KhaiBaoDemoTokenPage({ params }) {
  return <ReleaseInfoFormPage token={decodeURIComponent(params.token || "")} demo />;
}
