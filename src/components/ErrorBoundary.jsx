import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, msg: String(err?.message || err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 text-red-600 text-sm">
          Something went wrong: {this.state.msg}
        </div>
      );
    }
    return this.props.children;
  }
}
