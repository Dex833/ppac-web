// src/components/PageBackground.jsx
import React from "react";

const PageBackground = ({
  image,
  children,
  boxed = true,
  boxedWidth = "max-w-7xl", // max-w-3xl for bigger side gutters
  overlayClass = "bg-white/85 backdrop-blur",
  pad = "p-6",
  margin = "my-8",
  className,
}) => {
  const containerClasses = [
    "w-full",
    boxed ? `${boxedWidth} mx-auto` : "",
    className ? className : "px-4",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className="bg-center bg-cover bg-fixed"
      style={{
        backgroundImage: `url(${image})`,
        // assume ~64px header + ~64px footer; tweak if yours differ
        minHeight: "calc(100vh - 128px)",
      }}
    >
      <div className={containerClasses}>
        <div className={`rounded-2xl shadow-sm ${overlayClass} ${pad} ${margin}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageBackground;
