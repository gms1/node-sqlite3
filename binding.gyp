{
  "includes": [ "deps/common-sqlite.gypi" ],
  "variables": {
      "sqlite%":"internal",
      "sqlite_libname%":"sqlite3",
      "module_name": "node_sqlite3",
  },
  "targets": [
    {
      "target_name": "<(module_name)",
      "xcode_settings": {
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.7",
        "OTHER_CFLAGS": [ "-fstack-protector-strong" ]
      },
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
      ],
      "conditions": [
        ["sqlite != 'internal'", {
            "include_dirs": [
              "<!@(node -p \"require('node-addon-api').include\")", "<(sqlite)/include" ],
            "libraries": [
               "-l<(sqlite_libname)"
            ],
            "conditions": [
              [ "OS=='linux'", {"libraries+":["-Wl,-rpath=<@(sqlite)/lib"]} ],
              [ "OS!='win'", {"libraries+":["-L<@(sqlite)/lib"]} ]
            ],
            'msvs_settings': {
              'VCLinkerTool': {
                'AdditionalLibraryDirectories': [
                  '<(sqlite)/lib'
                ],
              },
            }
        },
        {
            "dependencies": [
              "deps/sqlite3.gyp:sqlite3"
            ]
        }
        ],
        # Linux hardening flags (apply to all builds)
        ["OS=='linux'", {
          "cflags+": [
            "-fstack-protector-strong",
            "-fPIC"
          ],
          "ldflags+": [ "-Wl,-z,relro,-z,now" ]
        }],
        # Windows hardening flags (apply to all builds)
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "BufferSecurityCheck": "true",
              "ControlFlowGuard": "Guard"
            },
            "VCLinkerTool": {
              "AdditionalOptions": [ "/DYNAMICBASE", "/NXCOMPAT" ]
            }
          }
        }]
      ],
      "sources": [
        "src/backup.cc",
        "src/database.cc",
        "src/node_sqlite3.cc",
        "src/statement.cc"
      ],
      "defines": [ "NAPI_VERSION=<(napi_build_version)" ],
      # Release-specific hardening flags
      "configurations": {
        "Release": {
          "conditions": [
            # _FORTIFY_SOURCE applies to all Linux architectures
            ["OS=='linux'", {
              "defines+": [ "_FORTIFY_SOURCE=2" ]
            }],
            # Control Flow Protection only for x86_64 (Intel CET)
            ["OS=='linux' and target_arch=='x64'", {
              "cflags+": [ "-fcf-protection=full" ]
            }],
            ["OS=='win'", {
              "msvs_settings": {
                "VCCLCompilerTool": {
                  "AdditionalOptions": [ "/sdl" ]
                }
              }
            }]
          ]
        }
      }
    }
  ]
}