import EmptyState from '../components/ui/EmptyState';

export default function HistoryPage() {
  return (
    <div className="page">
      <h2>기록</h2>
      <EmptyState message="기록 화면은 다음 작업에서 구현됩니다." />
    </div>
  );
}
