export default function ExploreLoading() {
  return (
    <div className="page-wrap" aria-busy="true" role="status">
      <p className="section-label">Public repository</p>
      <h1>Finding courses…</h1>
      <div className="repository-loading" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
