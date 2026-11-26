import RightsFormPage from "../../../lib/RightsFormPage";

export default function KhaiBaoTokenPage({ params }) {
  return <RightsFormPage token={decodeURIComponent(params.token || "")} withInfo />;
}
