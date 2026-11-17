import RightsHolderPage from "../../../../lib/RightsHolderPage";

export const metadata = { title: "Xác nhận quyền ca khúc", robots: { index: false, follow: false } };
export default function XacNhanPage({ params }) {
  return <RightsHolderPage token={decodeURIComponent(params.token || "")} />;
}
