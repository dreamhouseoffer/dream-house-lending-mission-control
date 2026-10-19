import { McPage, PageHeader, StateNotice } from "@/components/mc/ui";

// Shown while one bounded discovery page and its packages are read from the bridge (sequential, a few seconds).
export default function ContentLoading() {
  return (
    <McPage>
      <PageHeader eyebrow="Create" title="Content" description="Finished drafts with their result files, ready for your review." />
      <div aria-busy="true" data-testid="content-loading">
        <StateNotice kind="info" title="Checking finished tasks for declared draft packages…">
          Reading one bounded page of task attachments through the bridge. Nothing is published or changed.
        </StateNotice>
      </div>
    </McPage>
  );
}
