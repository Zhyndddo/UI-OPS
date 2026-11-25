import RightsFormPage from "../../../lib/RightsFormPage";

// Round 698 — DEMO of the combined page: rights declaration + Thông tin phát hành, one code, one submit. (Info-only demo: /thong-tin)
export default function KhaiBaoDemoTokenPage({ params }) {
  return <RightsFormPage token={decodeURIComponent(params.token || "")} withInfo demo />;
}
